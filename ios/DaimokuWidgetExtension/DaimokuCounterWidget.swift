import SwiftUI
import WidgetKit

private enum SharedSnapshotKeys {
  static let appGroup = "group.com.yoshi0703.daimokucounter"
  static let count = "daimoku_widget_count"
  static let elapsedSeconds = "daimoku_widget_elapsed_seconds"
  static let mode = "daimoku_widget_mode"
  static let todayTotal = "daimoku_widget_today_total"
  static let isRecording = "daimoku_widget_is_recording"
}

struct DaimokuSnapshotEntry: TimelineEntry {
  let date: Date
  let count: Int
  let elapsedSeconds: Int
  let mode: String
  let todayTotal: Int
  let isRecording: Bool
}

struct DaimokuSnapshotProvider: TimelineProvider {
  func placeholder(in context: Context) -> DaimokuSnapshotEntry {
    DaimokuSnapshotEntry(
      date: Date(),
      count: 0,
      elapsedSeconds: 0,
      mode: "manual",
      todayTotal: 0,
      isRecording: false
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (DaimokuSnapshotEntry) -> Void) {
    completion(loadEntry(date: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DaimokuSnapshotEntry>) -> Void) {
    let entry = loadEntry(date: Date())
    let next = Calendar.current.date(byAdding: .second, value: 30, to: Date()) ?? Date().addingTimeInterval(30)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }

  private func loadEntry(date: Date) -> DaimokuSnapshotEntry {
    let defaults = UserDefaults(suiteName: SharedSnapshotKeys.appGroup)
    return DaimokuSnapshotEntry(
      date: date,
      count: defaults?.integer(forKey: SharedSnapshotKeys.count) ?? 0,
      elapsedSeconds: defaults?.integer(forKey: SharedSnapshotKeys.elapsedSeconds) ?? 0,
      mode: defaults?.string(forKey: SharedSnapshotKeys.mode) ?? "manual",
      todayTotal: defaults?.integer(forKey: SharedSnapshotKeys.todayTotal) ?? 0,
      isRecording: defaults?.bool(forKey: SharedSnapshotKeys.isRecording) ?? false
    )
  }
}

struct DaimokuCounterWidgetEntryView: View {
  var entry: DaimokuSnapshotEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(entry.isRecording ? "録音中" : "停止中")
        .font(.caption)
        .foregroundStyle(entry.isRecording ? .green : .secondary)
      Text("\(entry.count)遍")
        .font(.system(size: 28, weight: .bold, design: .rounded))
        .minimumScaleFactor(0.7)
      HStack(spacing: 8) {
        Text("今日 \(entry.todayTotal)遍")
        Text(formatElapsed(entry.elapsedSeconds))
      }
      .font(.caption2)
      .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(12)
  }

  private func formatElapsed(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    if h > 0 {
      return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%02d:%02d", m, s)
  }
}

struct DaimokuCounterWidget: Widget {
  let kind = "DaimokuCounterWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DaimokuSnapshotProvider()) { entry in
      DaimokuCounterWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("題目カウンター")
    .description("録音状況と現在カウントを表示します。")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
