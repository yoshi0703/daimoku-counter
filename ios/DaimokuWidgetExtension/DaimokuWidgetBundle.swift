import WidgetKit
import SwiftUI

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
