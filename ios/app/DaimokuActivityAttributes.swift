import ActivityKit
import Foundation

struct DaimokuActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var count: Int
    var elapsedSeconds: Int
    var mode: String
    var todayTotal: Int
    var isRecording: Bool
  }

  var sessionId: String
  var startedAt: String
  var targetCount: Int
}
