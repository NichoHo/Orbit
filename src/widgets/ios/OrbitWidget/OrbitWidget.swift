import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), tasksCount: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date(), tasksCount: 3)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        // Here we would read from UserDefaults shared app group set by react-native-mmkv
        let userDefaults = UserDefaults(suiteName: "group.com.orbit.app")
        let tasksCount = userDefaults?.integer(forKey: "pending_tasks_count") ?? 0
        
        let entry = SimpleEntry(date: Date(), tasksCount: tasksCount)
        let timeline = Timeline(entries: [entry], policy: .atEnd)
        completion(timeline)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let tasksCount: Int
}

struct OrbitWidgetEntryView : View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading) {
            Text("Orbit Tasks")
                .font(.headline)
                .foregroundColor(.indigo)
            Text("\(entry.tasksCount) Pending")
                .font(.title)
                .bold()
        }
        .padding()
    }
}

@main
struct OrbitWidget: Widget {
    let kind: String = "OrbitWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                OrbitWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                OrbitWidgetEntryView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Orbit Tasks")
        .description("View your pending tasks on your home screen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
