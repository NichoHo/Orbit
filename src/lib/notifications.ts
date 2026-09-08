import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as any),
});

export async function requestPermissionsAsync() {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function scheduleTaskNotification(
  taskId: string,
  title: string,
  dueDate: Date
) {
  if (Platform.OS === 'web') return;
  // Don't schedule in the past
  if (dueDate.getTime() <= Date.now()) return;

  const hasPermission = await requestPermissionsAsync();
  if (!hasPermission) return;

  // We set the identifier to be deterministic so calling this multiple times
  // for the same task simply updates the existing scheduled notification.
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Task Due',
      body: title,
      data: { taskId },
    },
    trigger: dueDate as any,
    identifier: `task-${taskId}`,
  });
}

export async function cancelTaskNotification(taskId: string) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(`task-${taskId}`);
}
