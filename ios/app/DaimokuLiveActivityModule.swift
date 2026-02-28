import ActivityKit
import Foundation
import React
import WidgetKit

@objc(DaimokuLiveActivityModule)
class DaimokuLiveActivityModule: NSObject {
  private enum SharedKeys {
    static let appGroup = "group.com.yoshi0703.daimokucounter"
    static let count = "daimoku_widget_count"
    static let elapsedSeconds = "daimoku_widget_elapsed_seconds"
    static let mode = "daimoku_widget_mode"
    static let todayTotal = "daimoku_widget_today_total"
    static let isRecording = "daimoku_widget_is_recording"
    static let updatedAt = "daimoku_widget_updated_at"
  }

  private var pushTokens: [String: String] = [:]
  private var pushTokenTasks: [String: Task<Void, Never>] = [:]

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(isSupported:rejecter:)
  func isSupported(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 16.1, *) {
      resolve(true)
    } else {
      resolve(false)
    }
  }

  @objc(start:resolver:rejecter:)
  func start(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }

    Task {
      do {
        let attributes = makeAttributes(from: payload)
        let state = makeContentState(from: payload, defaultIsRecording: true)
        let activity = try requestActivity(attributes: attributes, state: state)
        observePushToken(for: activity)
        persistWidgetSnapshot(from: state)
        DispatchQueue.main.async {
          resolve(activity.id)
        }
      } catch {
        DispatchQueue.main.async {
          reject("live_activity_start_failed", error.localizedDescription, error)
        }
      }
    }
  }

  @objc(update:payload:resolver:rejecter:)
  func update(
    _ activityId: String,
    payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolve(false)
      return
    }

    guard let activity = findActivity(by: activityId) else {
      resolve(false)
      return
    }

    let state = makeContentState(from: payload, defaultIsRecording: true)
    Task {
      await updateActivity(activity, with: state)
      persistWidgetSnapshot(from: state)
      DispatchQueue.main.async {
        resolve(true)
      }
    }
  }

  @objc(stop:payload:resolver:rejecter:)
  func stop(
    _ activityId: String,
    payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolve(false)
      return
    }

    guard let activity = findActivity(by: activityId) else {
      resolve(false)
      return
    }

    let state = makeContentState(from: payload, defaultIsRecording: false)
    Task {
      await endActivity(activity, with: state)
      pushTokenTasks[activityId]?.cancel()
      pushTokenTasks[activityId] = nil
      pushTokens[activityId] = nil
      persistWidgetSnapshot(from: state)
      DispatchQueue.main.async {
        resolve(true)
      }
    }
  }

  @objc(syncWidgetSnapshot:resolver:rejecter:)
  func syncWidgetSnapshot(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let state = makeContentState(from: payload, defaultIsRecording: false)
    persistWidgetSnapshot(from: state)
    resolve(true)
  }

  @objc(getPushToken:resolver:rejecter:)
  func getPushToken(
    _ activityId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if let token = pushTokens[activityId] {
      resolve(token)
      return
    }

    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }

    if let activity = findActivity(by: activityId) {
      observePushToken(for: activity)
    }

    resolve(pushTokens[activityId])
  }
}

private extension DaimokuLiveActivityModule {
  func asInt(_ value: Any?, fallback: Int = 0) -> Int {
    if let number = value as? NSNumber {
      return number.intValue
    }
    if let integer = value as? Int {
      return integer
    }
    if let string = value as? String, let integer = Int(string) {
      return integer
    }
    return fallback
  }

  func asBool(_ value: Any?, fallback: Bool = false) -> Bool {
    if let boolValue = value as? Bool {
      return boolValue
    }
    if let number = value as? NSNumber {
      return number.boolValue
    }
    if let string = value as? String {
      return (string as NSString).boolValue
    }
    return fallback
  }

  func asString(_ value: Any?, fallback: String = "") -> String {
    if let string = value as? String {
      return string
    }
    return fallback
  }

  func makeAttributes(from payload: NSDictionary) -> DaimokuActivityAttributes {
    let sessionId = asString(payload["sessionId"], fallback: "session-\(Int(Date().timeIntervalSince1970))")
    let startedAt = asString(payload["startedAt"], fallback: ISO8601DateFormatter().string(from: Date()))
    let targetCount = asInt(payload["targetCount"], fallback: 100)
    return DaimokuActivityAttributes(sessionId: sessionId, startedAt: startedAt, targetCount: targetCount)
  }

  func makeContentState(from payload: NSDictionary, defaultIsRecording: Bool) -> DaimokuActivityAttributes.ContentState {
    DaimokuActivityAttributes.ContentState(
      count: asInt(payload["count"], fallback: 0),
      elapsedSeconds: asInt(payload["elapsedSeconds"], fallback: 0),
      mode: asString(payload["mode"], fallback: "manual"),
      todayTotal: asInt(payload["todayTotal"], fallback: 0),
      isRecording: asBool(payload["isRecording"], fallback: defaultIsRecording)
    )
  }

  @available(iOS 16.1, *)
  func requestActivity(
    attributes: DaimokuActivityAttributes,
    state: DaimokuActivityAttributes.ContentState
  ) throws -> Activity<DaimokuActivityAttributes> {
    if #available(iOS 16.2, *) {
      let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(120))
      return try Activity.request(attributes: attributes, content: content, pushType: .token)
    }

    return try Activity.request(attributes: attributes, contentState: state, pushType: .token)
  }

  @available(iOS 16.1, *)
  func findActivity(by activityId: String) -> Activity<DaimokuActivityAttributes>? {
    Activity<DaimokuActivityAttributes>.activities.first(where: { $0.id == activityId })
  }

  @available(iOS 16.1, *)
  func updateActivity(
    _ activity: Activity<DaimokuActivityAttributes>,
    with state: DaimokuActivityAttributes.ContentState
  ) async {
    if #available(iOS 16.2, *) {
      let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(120))
      await activity.update(content)
      return
    }

    await activity.update(using: state)
  }

  @available(iOS 16.1, *)
  func endActivity(
    _ activity: Activity<DaimokuActivityAttributes>,
    with state: DaimokuActivityAttributes.ContentState
  ) async {
    if #available(iOS 16.2, *) {
      let content = ActivityContent(state: state, staleDate: Date())
      await activity.end(content, dismissalPolicy: .immediate)
      return
    }

    await activity.end(using: state, dismissalPolicy: .immediate)
  }

  @available(iOS 16.1, *)
  func observePushToken(for activity: Activity<DaimokuActivityAttributes>) {
    if pushTokenTasks[activity.id] != nil {
      return
    }

    pushTokenTasks[activity.id] = Task { [weak self] in
      guard let self else { return }
      for await tokenData in activity.pushTokenUpdates {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        DispatchQueue.main.async {
          self.pushTokens[activity.id] = token
        }
      }
      DispatchQueue.main.async {
        self.pushTokenTasks[activity.id] = nil
      }
    }
  }

  func persistWidgetSnapshot(from state: DaimokuActivityAttributes.ContentState) {
    guard let defaults = UserDefaults(suiteName: SharedKeys.appGroup) else {
      return
    }

    defaults.set(state.count, forKey: SharedKeys.count)
    defaults.set(state.elapsedSeconds, forKey: SharedKeys.elapsedSeconds)
    defaults.set(state.mode, forKey: SharedKeys.mode)
    defaults.set(state.todayTotal, forKey: SharedKeys.todayTotal)
    defaults.set(state.isRecording, forKey: SharedKeys.isRecording)
    defaults.set(Date().timeIntervalSince1970, forKey: SharedKeys.updatedAt)

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
