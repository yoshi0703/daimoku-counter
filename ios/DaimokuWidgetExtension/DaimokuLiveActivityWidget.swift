import ActivityKit
import SwiftUI
import WidgetKit

@available(iOSApplicationExtension 16.1, *)
struct DaimokuLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DaimokuActivityAttributes.self) { context in
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text(context.state.isRecording ? "録音中" : "停止")
            .font(.caption)
            .foregroundStyle(context.state.isRecording ? .green : .secondary)
          Spacer()
          Text(context.state.mode.uppercased())
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text("\(context.state.count)")
            .font(.system(size: 38, weight: .bold, design: .rounded))
          Text("遍")
            .font(.title3.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        HStack(spacing: 12) {
          Label("経過 \(formatElapsed(context.state.elapsedSeconds))", systemImage: "clock")
          Label("今日 \(context.state.todayTotal)", systemImage: "chart.bar")
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
      }
      .padding(12)
      .activityBackgroundTint(Color(.systemBackground))
      .activitySystemActionForegroundColor(.primary)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.isRecording ? "録音中" : "停止")
              .font(.caption2)
              .foregroundStyle(context.state.isRecording ? .green : .secondary)
            Text(context.state.mode.uppercased())
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            Text("\(context.state.count)遍")
              .font(.headline)
            Text(formatElapsed(context.state.elapsedSeconds))
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Label("今日 \(context.state.todayTotal)遍", systemImage: "chart.bar")
            Spacer()
            Label("目標 \(context.attributes.targetCount)遍", systemImage: "target")
          }
          .font(.caption2)
          .foregroundStyle(.secondary)
        }
      } compactLeading: {
        Text("\(context.state.count)")
          .font(.caption.weight(.bold))
      } compactTrailing: {
        Text(shortElapsed(context.state.elapsedSeconds))
          .font(.caption2)
      } minimal: {
        Text("\(context.state.count)")
          .font(.caption2.weight(.bold))
      }
    }
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

  private func shortElapsed(_ seconds: Int) -> String {
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    return String(format: "%d:%02d", m, s)
  }
}
