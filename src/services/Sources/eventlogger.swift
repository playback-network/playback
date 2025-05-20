import Foundation
import Quartz

// known modifier keycodes (these aren't all real "keyDown" codes, but are unique in flagsChanged)
enum ModifierKey: Int64 {
    case command = 55
    case shift = 56
    case capsLock = 57
    case option = 58
    case control = 59
}

let modifierMap: [ModifierKey: String] = [
    .command: "cmd",
    .shift: "shift",
    .capsLock: "capsLock",
    .option: "alt",
    .control: "ctrl"
]

var activeModifiers: Set<String> = []
var isScrolling = false
let scrollDebounceInterval: TimeInterval = 0.1
var scrollEndTimer: Timer?


let specialKeys: Set<Int64> = [
    36, 48, 49, 53, 122, 123, 124, 125, 126 // return, esc, tab, space, arrows, etc.
]

func emit(_ eventData: [String: Any]) {
    if let jsonData = try? JSONSerialization.data(withJSONObject: eventData),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
        fflush(stdout) // ⬅️ important
    }
}

func handleScrollEvent(timestamp: TimeInterval) {

    if !isScrolling {
        isScrolling = true
        emit([
            "eventType": "scrollStart",
            "timestamp": timestamp
        ])
    }

    scrollEndTimer?.invalidate()
    scrollEndTimer = Timer.scheduledTimer(withTimeInterval: scrollDebounceInterval, repeats: false) { _ in
        isScrolling = false
        emit([
            "eventType": "scrollEnd",
            "timestamp": Date().timeIntervalSince1970
        ])
    }
}

func eventCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    let timestamp = Date().timeIntervalSince1970

    switch type {
    case .flagsChanged:
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        if let mod = ModifierKey(rawValue: keyCode), let name = modifierMap[mod] {
            let keyDown = event.flags.contains(.maskCommand) && mod == .command ||
                          event.flags.contains(.maskShift) && mod == .shift ||
                          event.flags.contains(.maskControl) && mod == .control ||
                          event.flags.contains(.maskAlternate) && mod == .option

            if keyDown {
                if !activeModifiers.contains(name) {
                    activeModifiers.insert(name)
                    emit([
                        "eventType": "flagsChanged",
                        "key": name,
                        "state": "down",
                        "modifiers": Array(activeModifiers),
                        "timestamp": timestamp
                    ])
                }
            } else {
                if activeModifiers.contains(name) {
                    activeModifiers.remove(name)
                    emit([
                        "eventType": "flagsChanged",
                        "key": name,
                        "state": "up",
                        "modifiers": Array(activeModifiers),
                        "timestamp": timestamp
                    ])
                }
            }
        }

    case .keyDown:
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        if specialKeys.contains(keyCode) {
            emit([
                "eventType": "specialKey",
                "keyCode": keyCode,
                "modifiers": Array(activeModifiers),
                "timestamp": timestamp
            ])
        }

    case .leftMouseDown, .rightMouseDown:
        let location = event.location
        emit([
            "eventType": (type == .leftMouseDown) ? "leftClick" : "rightClick",
            "x": location.x,
            "y": location.y,
            "timestamp": timestamp
        ])

    case .scrollWheel:
        handleScrollEvent(timestamp: timestamp)

    default:
        break
    }

    return Unmanaged.passRetained(event)
}

// mask for everything we care about
let eventMask = (
    (1 << CGEventType.flagsChanged.rawValue) |
    (1 << CGEventType.keyDown.rawValue) |
    (1 << CGEventType.leftMouseDown.rawValue) |
    (1 << CGEventType.rightMouseDown.rawValue) |
    (1 << CGEventType.scrollWheel.rawValue)
)

if let eventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: CGEventMask(eventMask),
    callback: eventCallback,
    userInfo: nil
) {
    let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
    CGEvent.tapEnable(tap: eventTap, enable: true)
    CFRunLoopRun()
} else {
    print("Failed to create event tap.")
}
