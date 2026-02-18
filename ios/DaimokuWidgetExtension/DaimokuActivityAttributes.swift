import ActivityKit
import Foundation

struct DaimokuActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var count: Int
    var elapsedSeconds: Int
    var mode: String
    var todayTotal: Int
  }

  var sessionId: String
  var startedAt: Date
  var targetCount: Int
}
