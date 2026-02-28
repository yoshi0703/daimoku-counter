import SwiftUI
import WidgetKit

@main
struct DaimokuWidgetBundle: WidgetBundle {
  @WidgetBundleBuilder
  var body: some Widget {
    DaimokuCounterWidget()
    if #available(iOSApplicationExtension 16.1, *) {
      DaimokuLiveActivityWidget()
    }
  }
}
