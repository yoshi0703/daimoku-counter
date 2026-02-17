import ActivityKit
import SwiftUI
import WidgetKit

@available(iOSApplicationExtension 16.1, *)
struct DaimokuLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DaimokuActivityAttributes.self) { context in
      lockScreenView(context: context)
        .activityBackgroundTint(Color(.systemBackground))
        .activitySystemActionForegroundColor(Color.primary)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text("題目")
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text("\(context.state.count)")
              .font(.headline)
              .monospacedDigit()
          }
        }

        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            Text("本日")
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text("\(context.state.todayTotal)")
              .font(.headline)
              .monospacedDigit()
          }
        }

        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text("経過")
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
              .font(.body.monospacedDigit())
            Spacer()
            Text(context.state.mode.uppercased())
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          .padding(.top, 4)
        }
      } compactLeading: {
        Text("題")
          .font(.caption2)
      } compactTrailing: {
        Text("\(context.state.count)")
          .font(.caption2.monospacedDigit())
      } minimal: {
        Text("\(context.state.count)")
          .font(.caption2.monospacedDigit())
      }
    }
  }

  private func lockScreenView(context: ActivityViewContext<DaimokuActivityAttributes>) -> some View {
    HStack {
      VStack(alignment: .leading, spacing: 4) {
        Text("題目カウンター")
          .font(.caption)
          .foregroundStyle(.secondary)
        Text("\(context.state.count)")
          .font(.system(size: 32, weight: .bold, design: .rounded))
          .monospacedDigit()
        Text("本日 \(context.state.todayTotal)")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 4) {
        Text(context.state.mode.uppercased())
          .font(.caption)
          .foregroundStyle(.secondary)
        Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
          .font(.body.monospacedDigit())
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }
}
