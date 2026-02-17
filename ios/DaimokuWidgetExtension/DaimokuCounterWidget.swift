import SwiftUI
import WidgetKit

private let appGroupSuite = "group.com.yoshi0703.daimokucounter"

struct DaimokuWidgetEntry: TimelineEntry {
  let date: Date
  let todayTotal: Int
  let sessionCount: Int
  let elapsedSeconds: Int
  let isRecording: Bool
  let mode: String
}

struct DaimokuWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> DaimokuWidgetEntry {
    DaimokuWidgetEntry(
      date: Date(),
      todayTotal: 108,
      sessionCount: 12,
      elapsedSeconds: 480,
      isRecording: true,
      mode: "native"
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (DaimokuWidgetEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DaimokuWidgetEntry>) -> Void) {
    let entry = loadEntry()
    let nextUpdate = Calendar.current.date(byAdding: .minute, value: 5, to: Date()) ?? Date().addingTimeInterval(300)
    completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
  }

  private func loadEntry() -> DaimokuWidgetEntry {
    let defaults = UserDefaults(suiteName: appGroupSuite)

    return DaimokuWidgetEntry(
      date: Date(),
      todayTotal: defaults?.integer(forKey: "widget_today_total") ?? 0,
      sessionCount: defaults?.integer(forKey: "widget_session_count") ?? 0,
      elapsedSeconds: defaults?.integer(forKey: "widget_elapsed_seconds") ?? 0,
      isRecording: defaults?.bool(forKey: "widget_is_recording") ?? false,
      mode: defaults?.string(forKey: "widget_mode") ?? "manual"
    )
  }
}

struct DaimokuWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: DaimokuWidgetEntry

  var body: some View {
    switch family {
    case .accessoryInline:
      Text(inlineLabel)
    case .accessoryCircular:
      VStack(spacing: 2) {
        Text("題")
          .font(.caption2)
        Text("\(entry.todayTotal)")
          .font(.system(size: 13, weight: .semibold))
      }
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 3) {
        Text("題目カウンター")
          .font(.caption2)
          .foregroundStyle(.secondary)
        Text("本日 \(entry.todayTotal)")
          .font(.system(size: 15, weight: .semibold))
        if entry.isRecording {
          Text("録音中 +\(entry.sessionCount)")
            .font(.caption2)
        }
      }
    case .systemMedium:
      mediumBody
    default:
      smallBody
    }
  }

  private var inlineLabel: String {
    if entry.isRecording {
      return "題目 本日\(entry.todayTotal) (+\(entry.sessionCount))"
    }
    return "題目 本日\(entry.todayTotal)"
  }

  private var smallBody: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("題目カウンター")
        .font(.caption)
        .foregroundStyle(.secondary)

      Text("\(entry.todayTotal)")
        .font(.system(size: 34, weight: .bold, design: .rounded))
        .monospacedDigit()

      if entry.isRecording {
        Text("録音中 +\(entry.sessionCount)")
          .font(.caption2)
      } else {
        Text("待機中")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(8)
  }

  private var mediumBody: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(alignment: .leading, spacing: 6) {
        Text("本日の累計")
          .font(.caption)
          .foregroundStyle(.secondary)
        Text("\(entry.todayTotal)")
          .font(.system(size: 30, weight: .bold, design: .rounded))
          .monospacedDigit()
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 6) {
        if entry.isRecording {
          Text("録音中")
            .font(.caption)
            .foregroundStyle(.green)
          Text("+\(entry.sessionCount)")
            .font(.title3)
            .bold()
            .monospacedDigit()
        } else {
          Text("待機中")
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        Text(entry.mode.uppercased())
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding(10)
  }
}

struct DaimokuCounterWidget: Widget {
  let kind = "DaimokuCounterWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DaimokuWidgetProvider()) { entry in
      DaimokuWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("題目カウンター")
    .description("本日の題目回数と録音中セッションを表示します。")
    .supportedFamilies([
      .systemSmall,
      .systemMedium,
      .accessoryInline,
      .accessoryCircular,
      .accessoryRectangular,
    ])
  }
}
