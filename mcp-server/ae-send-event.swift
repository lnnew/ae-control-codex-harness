import AppKit
import Foundation

func fourCC(_ value: String) -> UInt32 {
    var result: UInt32 = 0
    for byte in value.utf8.prefix(4) {
        result = (result << 8) | UInt32(byte)
    }
    return result
}

guard CommandLine.arguments.count == 3,
      let pidValue = Int32(CommandLine.arguments[1]) else {
    fputs("usage: ae-send-event <pid> <jsx-path>\n", stderr)
    exit(64)
}

let scriptURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard FileManager.default.fileExists(atPath: scriptURL.path) else {
    fputs("JSX file does not exist: \(scriptURL.path)\n", stderr)
    exit(66)
}

let target = NSAppleEventDescriptor(processIdentifier: pid_t(pidValue))
let event = NSAppleEventDescriptor(
    eventClass: fourCC("misc"),
    eventID: fourCC("file"),
    targetDescriptor: target,
    returnID: AEReturnID(kAutoGenerateReturnID),
    transactionID: AETransactionID(kAnyTransactionID)
)
event.setParam(NSAppleEventDescriptor(fileURL: scriptURL), forKeyword: AEKeyword(keyDirectObject))
event.setParam(NSAppleEventDescriptor(boolean: true), forKeyword: AEKeyword(fourCC("Over")))

do {
    let reply = try event.sendEvent(options: [.waitForReply], timeout: 45)
    if let text = reply.stringValue { print(text) }
} catch {
    fputs("Apple Event failed: \(error)\n", stderr)
    exit(1)
}
