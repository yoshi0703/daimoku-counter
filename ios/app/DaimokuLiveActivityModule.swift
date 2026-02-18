import ActivityKit
import Foundation
import React
import WidgetKit

@objc(DaimokuLiveActivityModule)
class DaimokuLiveActivityModule: NSObject {
  private let appGroupSuite = "group.com.yoshi0703.daimokucounter"
  private let backgroundRefreshInterval: TimeInterval = 2.0
  private var activeActivityId: String?
  private var backgroundUpdateTimer: DispatchSourceTimer?
  private var lastAppliedSignature: String?
  private var pushTokenByActivityId: [String: String] = [:]
  private var pushTokenObserverTasks: [String: Task<Void, Never>] = [:]

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func isSupported(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    if #available(iOS 16.1, *) {
      resolve(true)
    } else {
      resolve(false)
    }
  }

  @objc
  func start(_ payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }

    let startedAt = dateValue(from: payload["startedAt"]) ?? Date()
    let sessionId = stringValue(from: payload["sessionId"]) ?? UUID().uuidString
    let targetCount = intValue(from: payload["targetCount"]) ?? 100
    let contentState = makeContentState(from: payload)

    let attributes = DaimokuActivityAttributes(
      sessionId: sessionId,
      startedAt: startedAt,
      targetCount: targetCount
    )

    do {
      let activity = try requestActivity(attributes: attributes, contentState: contentState)
      activeActivityId = activity.id
      if #available(iOS 16.2, *) {
        observePushTokenUpdates(for: activity)
      }
      persistSnapshot(
        count: contentState.count,
        elapsedSeconds: contentState.elapsedSeconds,
        todayTotal: contentState.todayTotal,
        mode: contentState.mode,
        isRecording: true
      )
      resolve(activity.id)
    } catch {
      reject("LIVE_ACTIVITY_START_FAILED", error.localizedDescription, error)
    }
  }

  @objc
  func update(_ activityId: String, payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.1, *) else {
      resolve(false)
      return
    }

    activeActivityId = activityId
    Task {
      guard let activity = Activity<DaimokuActivityAttributes>.activities.first(where: { $0.id == activityId }) else {
        resolve(false)
        return
      }

      if #available(iOS 16.2, *) {
        observePushTokenUpdates(for: activity)
      }
      let contentState = makeContentState(from: payload)
      await updateActivity(activity, contentState: contentState)
      persistSnapshot(
        count: contentState.count,
        elapsedSeconds: contentState.elapsedSeconds,
        todayTotal: contentState.todayTotal,
        mode: contentState.mode,
        isRecording: true
      )
      resolve(true)
    }
  }

  @objc
  func stop(_ activityId: String, payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.1, *) else {
      resolve(false)
      return
    }

    activeActivityId = activityId
    Task {
      let contentState = makeContentState(from: payload)

      if let activity = Activity<DaimokuActivityAttributes>.activities.first(where: { $0.id == activityId }) {
        await endActivity(activity, finalState: contentState)
      }

      persistSnapshot(
        count: 0,
        elapsedSeconds: 0,
        todayTotal: contentState.todayTotal,
        mode: contentState.mode,
        isRecording: false
      )
      activeActivityId = nil
      stopObservingPushTokenUpdates(for: activityId)
      pushTokenByActivityId.removeValue(forKey: activityId)
      stopBackgroundActivityUpdates()
      resolve(true)
    }
  }

  @objc
  func getPushToken(_ activityId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }

    resolve(pushTokenByActivityId[activityId])
  }

  @objc
  func syncWidgetSnapshot(_ payload: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let count = intValue(from: payload["count"]) ?? 0
    let elapsedSeconds = intValue(from: payload["elapsedSeconds"]) ?? 0
    let todayTotal = intValue(from: payload["todayTotal"]) ?? 0
    let mode = stringValue(from: payload["mode"]) ?? "manual"
    let isRecording = boolValue(from: payload["isRecording"]) ?? false

    persistSnapshot(
      count: count,
      elapsedSeconds: elapsedSeconds,
      todayTotal: todayTotal,
      mode: mode,
      isRecording: isRecording
    )
    resolve(true)
  }

  private func makeContentState(from payload: NSDictionary) -> DaimokuActivityAttributes.ContentState {
    return DaimokuActivityAttributes.ContentState(
      count: intValue(from: payload["count"]) ?? 0,
      elapsedSeconds: intValue(from: payload["elapsedSeconds"]) ?? 0,
      mode: stringValue(from: payload["mode"]) ?? "manual",
      todayTotal: intValue(from: payload["todayTotal"]) ?? 0
    )
  }

  private func persistSnapshot(count: Int, elapsedSeconds: Int, todayTotal: Int, mode: String, isRecording: Bool) {
    guard let defaults = UserDefaults(suiteName: appGroupSuite) else {
      return
    }

    defaults.set(count, forKey: "widget_session_count")
    defaults.set(elapsedSeconds, forKey: "widget_elapsed_seconds")
    defaults.set(todayTotal, forKey: "widget_today_total")
    defaults.set(mode, forKey: "widget_mode")
    defaults.set(isRecording, forKey: "widget_is_recording")
    defaults.set(Date().timeIntervalSince1970, forKey: "widget_updated_at")

    if isRecording {
      let shouldForceApply = backgroundUpdateTimer == nil
      startBackgroundActivityUpdatesIfNeeded()
      applySnapshotToActiveActivityIfNeeded(force: shouldForceApply)
    } else {
      stopBackgroundActivityUpdates()
      lastAppliedSignature = nil
    }

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  @available(iOS 16.1, *)
  private func requestActivity(
    attributes: DaimokuActivityAttributes,
    contentState: DaimokuActivityAttributes.ContentState
  ) throws -> Activity<DaimokuActivityAttributes> {
    if #available(iOS 16.2, *) {
      return try Activity<DaimokuActivityAttributes>.request(
        attributes: attributes,
        content: makeActivityContent(contentState),
        pushType: .token
      )
    }

    return try Activity<DaimokuActivityAttributes>.request(
      attributes: attributes,
      contentState: contentState,
      pushType: nil
    )
  }

  @available(iOS 16.1, *)
  private func updateActivity(
    _ activity: Activity<DaimokuActivityAttributes>,
    contentState: DaimokuActivityAttributes.ContentState
  ) async {
    if #available(iOS 16.2, *) {
      await activity.update(makeActivityContent(contentState))
      return
    }

    await activity.update(using: contentState)
  }

  @available(iOS 16.1, *)
  private func endActivity(
    _ activity: Activity<DaimokuActivityAttributes>,
    finalState: DaimokuActivityAttributes.ContentState
  ) async {
    if #available(iOS 16.2, *) {
      await activity.end(makeActivityContent(finalState), dismissalPolicy: .immediate)
      return
    }

    await activity.end(using: finalState, dismissalPolicy: .immediate)
  }

  @available(iOS 16.2, *)
  private func makeActivityContent(
    _ contentState: DaimokuActivityAttributes.ContentState
  ) -> ActivityContent<DaimokuActivityAttributes.ContentState> {
    ActivityContent(
      state: contentState,
      staleDate: Date().addingTimeInterval(120)
    )
  }

  @available(iOS 16.2, *)
  private func observePushTokenUpdates(for activity: Activity<DaimokuActivityAttributes>) {
    if pushTokenObserverTasks[activity.id] != nil {
      return
    }

    let task = Task { [weak self] in
      for await tokenData in activity.pushTokenUpdates {
        let tokenHex = tokenData.map { String(format: "%02x", $0) }.joined()
        DispatchQueue.main.async {
          self?.pushTokenByActivityId[activity.id] = tokenHex
        }
      }
    }
    pushTokenObserverTasks[activity.id] = task
  }

  private func stopObservingPushTokenUpdates(for activityId: String) {
    pushTokenObserverTasks[activityId]?.cancel()
    pushTokenObserverTasks.removeValue(forKey: activityId)
  }

  private func startBackgroundActivityUpdatesIfNeeded() {
    guard backgroundUpdateTimer == nil else {
      return
    }

    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
    timer.schedule(deadline: .now() + backgroundRefreshInterval, repeating: backgroundRefreshInterval)
    timer.setEventHandler { [weak self] in
      self?.applySnapshotToActiveActivityIfNeeded(force: false)
    }
    timer.resume()
    backgroundUpdateTimer = timer
  }

  private func stopBackgroundActivityUpdates() {
    backgroundUpdateTimer?.cancel()
    backgroundUpdateTimer = nil
  }

  private func applySnapshotToActiveActivityIfNeeded(force: Bool) {
    guard #available(iOS 16.1, *), let snapshot = loadSnapshot() else {
      return
    }

    let snapshotSignature = "\(snapshot.count)|\(snapshot.elapsedSeconds)|\(snapshot.todayTotal)|\(snapshot.mode)"
    if !force && snapshotSignature == lastAppliedSignature {
      return
    }

    let targetActivity: Activity<DaimokuActivityAttributes>?
    if let activityId = activeActivityId {
      targetActivity = Activity<DaimokuActivityAttributes>.activities.first(where: { $0.id == activityId })
    } else {
      targetActivity = Activity<DaimokuActivityAttributes>.activities.first
    }

    guard let activity = targetActivity else {
      return
    }
    activeActivityId = activity.id

    lastAppliedSignature = snapshotSignature
    Task {
      await updateActivity(activity, contentState: snapshot.contentState)
    }
  }

  private func loadSnapshot() -> Snapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupSuite) else {
      return nil
    }

    let count = defaults.integer(forKey: "widget_session_count")
    let elapsedSeconds = defaults.integer(forKey: "widget_elapsed_seconds")
    let todayTotal = defaults.integer(forKey: "widget_today_total")
    let mode = defaults.string(forKey: "widget_mode") ?? "manual"

    return Snapshot(
      count: count,
      elapsedSeconds: elapsedSeconds,
      todayTotal: todayTotal,
      mode: mode
    )
  }

  private func intValue(from value: Any?) -> Int? {
    if let num = value as? NSNumber {
      return num.intValue
    }
    if let str = value as? String {
      return Int(str)
    }
    return nil
  }

  private func boolValue(from value: Any?) -> Bool? {
    if let bool = value as? Bool {
      return bool
    }
    if let num = value as? NSNumber {
      return num.boolValue
    }
    if let str = value as? String {
      return (str as NSString).boolValue
    }
    return nil
  }

  private func stringValue(from value: Any?) -> String? {
    if let str = value as? String {
      return str
    }
    if let num = value as? NSNumber {
      return num.stringValue
    }
    return nil
  }

  private func dateValue(from value: Any?) -> Date? {
    if let date = value as? Date {
      return date
    }
    if let str = value as? String {
      return ISO8601DateFormatter().date(from: str)
    }
    if let num = value as? NSNumber {
      return Date(timeIntervalSince1970: num.doubleValue)
    }
    return nil
  }

  private struct Snapshot {
    let count: Int
    let elapsedSeconds: Int
    let todayTotal: Int
    let mode: String

    var contentState: DaimokuActivityAttributes.ContentState {
      DaimokuActivityAttributes.ContentState(
        count: count,
        elapsedSeconds: elapsedSeconds,
        mode: mode,
        todayTotal: todayTotal
      )
    }
  }
}
