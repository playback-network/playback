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
    let cgContext = CGContext(
        data: nil,
        width: Int(imageWidth),
        height: Int(imageHeight),
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )

    guard let ctx = cgContext else {
        print("❌ Failed to create CGContext")
        return nil
    }

    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: imageWidth, height: imageHeight))

    let redColor = CGColor(red: 1, green: 0, blue: 0, alpha: 1)
    ctx.setFillColor(redColor)
    ctx.setStrokeColor(redColor)
    ctx.setLineWidth(2)

    //print("🛑 Redacting Entities:", entities)

    var redactionCount = 0

    for (ocrText, bbox) in words {
        let cleanedOcrText = ocrText.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

        for entity in entities {
            let normalizedEntity = entity.lowercased().replacingOccurrences(of: "[^a-zA-Z0-9]", with: "", options: .regularExpression)
            let normalizedOcrText = cleanedOcrText.replacingOccurrences(of: "[^a-zA-Z0-9]", with: "", options: .regularExpression)

            if normalizedOcrText.contains(normalizedEntity) {
                // print("🛑 MATCH FOUND! Redacting:", entity, "inside", ocrText)

                // 🔹 Locate entity inside the OCR-detected text
                if let range = ocrText.range(of: entity) {
                    let startIndex = ocrText.distance(from: ocrText.startIndex, to: range.lowerBound)
                    let endIndex = ocrText.distance(from: ocrText.startIndex, to: range.upperBound)

                    let relativeStartX = CGFloat(startIndex) / CGFloat(ocrText.count)
                    let relativeEndX = CGFloat(endIndex) / CGFloat(ocrText.count)

                    // 🔥 Extract only the entity's bounding box
                    let entityX = bbox.origin.x + (relativeStartX * bbox.width)
                    let entityWidth = (relativeEndX - relativeStartX) * bbox.width
                    let entityY = bbox.origin.y
                    let entityHeight = bbox.height

                    // ✅ Preserve your `y` calculation
                    let x = entityX * imageWidth
                    let y = entityY * imageHeight
                    let width = entityWidth * imageWidth
                    let height = entityHeight * imageHeight

                    // 🔹 Expand slightly to avoid clipping
                    let paddingX: CGFloat = max(5, width * 0.1)
                    let paddingY: CGFloat = max(5, height * 0.1)

                    let rect = CGRect(x: x - paddingX / 2,
                                      y: y - paddingY / 2,
                                      width: width + paddingX,
                                      height: height + paddingY)

                    ctx.fill(rect) // 🔹 Fill the redaction box
                    ctx.stroke(rect) // 🔹 Draw an outline

                    // print("📌 Redaction #\(redactionCount): x=\(x), y=\(y), width=\(width), height=\(height)")
                    redactionCount += 1
                }
            }
        }
    }

    if redactionCount == 0 {
        print("❌ No bounding boxes were drawn! Check if the detected words match the redacted entities.")
    }

    guard let newCGImage = ctx.makeImage() else {
        print("❌ Failed to create redacted CGImage")
        return nil
    }

    let finalImage = NSBitmapImageRep(cgImage: newCGImage)

    // ✅ Return the image as JPG data instead of saving it
    return finalImage.representation(using: .jpeg, properties: [.compressionFactor: 0.7])
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
