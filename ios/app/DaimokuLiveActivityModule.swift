import ActivityKit
import Foundation
import React
import WidgetKit

@objc(DaimokuLiveActivityModule)
class DaimokuLiveActivityModule: NSObject {
  private let appGroupSuite = "group.com.yoshi0703.daimokucounter"

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
      let activity = try Activity<DaimokuActivityAttributes>.request(
        attributes: attributes,
        contentState: contentState,
        pushType: nil
      )
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

    Task {
      guard let activity = Activity<DaimokuActivityAttributes>.activities.first(where: { $0.id == activityId }) else {
        resolve(false)
        return
      }

      let contentState = makeContentState(from: payload)
      await activity.update(using: contentState)
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

    Task {
      let contentState = makeContentState(from: payload)

      if let activity = Activity<DaimokuActivityAttributes>.activities.first(where: { $0.id == activityId }) {
        await activity.end(dismissalPolicy: .immediate)
      }

      persistSnapshot(
        count: 0,
        elapsedSeconds: 0,
        todayTotal: contentState.todayTotal,
        mode: contentState.mode,
        isRecording: false
      )
      resolve(true)
    }
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
      todayTotal: intValue(from: payload["todayTotal"]) ?? 0,
      updatedAt: dateValue(from: payload["updatedAt"]) ?? Date()
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

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
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
}
