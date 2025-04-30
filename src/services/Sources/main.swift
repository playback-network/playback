import Vapor
import Vision
import Foundation
import CoreImage
import NaturalLanguage
import CoreGraphics
import AppKit
import SQLite3
import Dispatch

let processingQueue = DispatchQueue(label: "ocr.processing.queue", attributes: .concurrent)
let semaphore = DispatchSemaphore(value: 3)

struct Redactor {
    
    static let patterns: [String: String] = [
        "email": #"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"#,
        "phone": #"(\+?\d{1,3}?[-.\s]?(\(?\d{1,4}?\))?[-.\s]?\d{1,4}[-.\s]?\d{1,9})"#,
        "mongoID": #"^[a-f\d]{24}$"#,
        "passportNumber": #"^(?!^0+$)[a-zA-Z0-9]{3,20}$"#,
        "flightNumber": #"^[A-Z]{2}\d{3,4}$"#,
        "iban": #"^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$"#,
        "bankAccount": #"^\d{6,20}$"#,
        "ipv4": #"^(?:\d{1,3}\.){3}\d{1,3}$"#,
        "ipv6": #"^(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}$"#,
        "passwordField": #"(?i)(password|passwd|pwd)\s*[:=]\s*.+$"#  // captures things like "password: hunter2"
    ]
    
    static func redact(in text: String) -> String {
        var redactedText = text
        
        for (label, pattern) in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: []) {
                let matches = regex.matches(in: redactedText, options: [], range: NSRange(redactedText.startIndex..., in: redactedText))
                
                for match in matches.reversed() {  // reverse so ranges don't shift
                    if let range = Range(match.range, in: redactedText) {
                        redactedText.replaceSubrange(range, with: "[REDACTED \(label.uppercased())]")
                    }
                }
            }
        }
        return redactedText
    }
}


func processImage(_ base64Image: String) throws -> String? {
    semaphore.wait()
    defer { semaphore.signal() }

    guard let imageData = Data(base64Encoded: base64Image) else {
        print("❌ Invalid Base64 image data")
        return nil
    }

    let words = performOCR(on: imageData)
    let text = words.map { $0.0 }.joined(separator: " ")
    let entities = performNER(on: text)

    if let redactedImageData = drawRedactionBoxes(on: imageData, words: words, entities: entities) {
        return redactedImageData.base64EncodedString()
    }

    throw Abort (.internalServerError, reason: "Failed to process image")
}

func performOCR(on imageData: Data) -> [(String, CGRect)] {
    guard let ciImage = CIImage(data: imageData) else { return [] }
    let requestHandler = VNImageRequestHandler(ciImage: ciImage, options: [:])
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]
    request.minimumTextHeight = 0.02

    do {
        try requestHandler.perform([request])
        guard let results = request.results else { return [] }

        var extractedWords: [(String, CGRect)] = []
        for observation in results {
            guard let candidate = observation.topCandidates(1).first else { continue }

            let normalizedBox = observation.boundingBox  // Bounding box in normalized coordinates
            // print("🔎 Word: \(candidate.string), Normalized Box: \(normalizedBox)")

            extractedWords.append((candidate.string, normalizedBox))
        }
        
        return extractedWords
    } catch {
        print("OCR Error: \(error)")
        return []
    }
}

func performNER(on text: String) -> [String] {
    var entities: Set<String> = []

    for (_, pattern) in Redactor.patterns {
        if let regex = try? NSRegularExpression(pattern: pattern, options: []) {
            let matches = regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
            for match in matches {
                if let range = Range(match.range, in: text) {
                    let detected = String(text[range])
                    entities.insert(detected)
                }
            }
        }
    }

    return Array(entities)
}

func drawRedactionBoxes(on imageData: Data, words: [(String, CGRect)], entities: [String]) -> Data? {
    guard let ciImage = CIImage(data: imageData) else {
        print("❌ Failed to create CIImage")
        return nil
    }

    let context = CIContext()
    guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
        print("❌ Failed to convert CIImage to CGImage")
        return nil
    }

    let imageWidth = CGFloat(cgImage.width)
    let imageHeight = CGFloat(cgImage.height)

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
        data: nil,
        width: Int(imageWidth),
        height: Int(imageHeight),
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        print("❌ Failed to create CGContext")
        return nil
    }

    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: imageWidth, height: imageHeight))

    let nsContext = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = nsContext

    let font = NSFont.systemFont(ofSize: 12, weight: .bold)
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center

    for (ocrText, bbox) in words {
        for (label, pattern) in Redactor.patterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: []),
               regex.firstMatch(in: ocrText, options: [], range: NSRange(ocrText.startIndex..., in: ocrText)) != nil {

                // compute position
                let x = bbox.origin.x * imageWidth
                let y = bbox.origin.y * imageHeight
                let width = bbox.width * imageWidth
                let height = bbox.height * imageHeight

                // sample surrounding area
                let pad: CGFloat = 10
                let sampleRect = CGRect(x: max(x - pad, 0), y: max(y - pad, 0),
                                        width: min(width + 2*pad, imageWidth - x),
                                        height: min(height + 2*pad, imageHeight - y))

                let cropped = cgImage.cropping(to: sampleRect)
                let avgColor = averageColor(of: cropped) ?? NSColor.gray

                // draw redaction box
                let cgColor = avgColor.cgColor
                ctx.setFillColor(cgColor)
                ctx.fill(CGRect(x: x, y: y, width: width, height: height))

                // draw text
                let attributes: [NSAttributedString.Key: Any] = [
                    .font: font,
                    .foregroundColor: NSColor.white,
                    .paragraphStyle: paragraph
                ]

                let text = "[REDACTED \(label.uppercased())]"
                let attributed = NSAttributedString(string: text, attributes: attributes)
                attributed.draw(in: CGRect(x: x, y: y + (height - 14) / 2, width: width, height: 14))
            }
        }
    }

    guard let newCGImage = ctx.makeImage() else { return nil }
    let finalImage = NSBitmapImageRep(cgImage: newCGImage)
    return finalImage.representation(using: .jpeg, properties: [.compressionFactor: 0.7])
}

func averageColor(of image: CGImage?) -> NSColor? {
    guard let image = image else { return nil }

    let width = image.width
    let height = image.height
    let data = UnsafeMutablePointer<UInt8>.allocate(capacity: 4 * width * height)

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(data: data, width: width, height: height,
                              bitsPerComponent: 8, bytesPerRow: width * 4,
                              space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }

    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

    var rTotal = 0, gTotal = 0, bTotal = 0, count = 0
    for i in stride(from: 0, to: width * height * 4, by: 4) {
        rTotal += Int(data[i])
        gTotal += Int(data[i+1])
        bTotal += Int(data[i+2])
        count += 1
    }

    data.deallocate()

    guard count > 0 else { return nil }
    return NSColor(calibratedRed: CGFloat(rTotal) / CGFloat(count) / 255,
                   green: CGFloat(gTotal) / CGFloat(count) / 255,
                   blue: CGFloat(bTotal) / CGFloat(count) / 255,
                   alpha: 1.0)
}


func routes(_ app: Application) throws {
    app.routes.defaultMaxBodySize = "10mb"
    app.post("ocr") { req -> Response in
        guard let imageData = try? req.content.get(Data.self, at: "image") else {
            let err = ["status": "error", "error": "Missing or invalid 'image' in multipart body"]
            let json = try JSONSerialization.data(withJSONObject: err)
            return Response(status: .badRequest, body: .init(data: json))
        }

        if let redactedBase64 = try? processImage(imageData.base64EncodedString()) {
            let success = ["status": "success", "redactedImage": redactedBase64]
            let json = try JSONSerialization.data(withJSONObject: success)
            return Response(status: .ok, body: .init(data: json))
        } else {
            let fail = ["status": "error", "error": "OCR processing failed"]
            let json = try JSONSerialization.data(withJSONObject: fail)
            return Response(status: .internalServerError, body: .init(data: json))
        }
    }
}

var env = try Environment.detect()
let app = try await Application.make(env)
try routes(app)
try await app.execute()
