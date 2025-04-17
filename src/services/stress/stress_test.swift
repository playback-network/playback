import Foundation

let imagePath = "stress/image.jpg" // use a small ~100KB JPEG
let concurrentRequests = 10
let totalRequests = 1000
let endpoint = URL(string: "http://localhost:8080/ocr")!

let imageData = try! Data(contentsOf: URL(fileURLWithPath: imagePath))
let base64String = imageData.base64EncodedString()
let boundary = "Boundary-\(UUID().uuidString)"

var successCount = 0
var failureCount = 0
let lock = NSLock()

let group = DispatchGroup()

let headers = [
    "Content-Type": "multipart/form-data; boundary=\(boundary)"
]

func makeRequest() {
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.allHTTPHeaderFields = headers

    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"image\"; filename=\"frame.jpg\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
    body.append(imageData)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    request.httpBody = body

    group.enter()
    URLSession.shared.dataTask(with: request) { data, response, error in
        defer { group.leave() }

        lock.lock()
        if let http = response as? HTTPURLResponse, http.statusCode == 200 {
            successCount += 1
        } else {
            failureCount += 1
            if let error = error {
                print("❌", error.localizedDescription)
            } else if let data = data {
                print("❌", String(data: data, encoding: .utf8) ?? "no response")
            }
        }
        lock.unlock()
    }.resume()
}

let timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
    let taskInfo = ProcessInfo.processInfo
    let memUsed = taskInfo.physicalMemory / 1024 / 1024
    print("🔄 Memory: \(memUsed) MB | ✅ \(successCount) | ❌ \(failureCount)")
}

for _ in 0..<totalRequests {
    DispatchQueue.global().async {
        makeRequest()
    }
    usleep(UInt32(1_000_000 / concurrentRequests)) // throttle
}

group.notify(queue: .main) {
    timer.invalidate()
    print("✅ Done: \(successCount) successful, \(failureCount) failed.")
    exit(0)
}

RunLoop.main.run()
