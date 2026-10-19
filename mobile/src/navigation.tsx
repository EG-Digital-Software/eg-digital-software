import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { useBoard } from './lib/queries';
import { unreadCount, useSeenVersion } from './lib/seen';
import { colors } from './theme';

import LoginScreen from './screens/LoginScreen';
import TasksScreen from './screens/TasksScreen';
import ChatsScreen from './screens/ChatsScreen';
import ProfileScreen from './screens/ProfileScreen';
import TaskDetailScreen from './screens/TaskDetailScreen';
import TaskChatScreen from './screens/TaskChatScreen';
import CustomerPickerScreen from './screens/CustomerPickerScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const stackOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '600' as const },
  headerBackButtonDisplayMode: 'minimal' as const,
  contentStyle: { backgroundColor: colors.background },
};

const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Tasks: ['checkbox', 'checkbox-outline'],
  Chats: ['chatbubbles', 'chatbubbles-outline'],
  Profile: ['person', 'person-outline'],
};

function Tabs() {
  const { user } = useAuth();
  const { tasks } = useBoard();
  useSeenVersion();
  const unread = tasks.reduce((s, t) => s + unreadCount(t, user?.id), 0);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ focused, color, size }) => {
          const [on, off] = icons[route.name]!;
          return <Ionicons name={focused ? on : off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{ tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined, tabBarBadgeStyle: { backgroundColor: colors.accent } }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.primary,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

function Splash() {
  return (
    <View style={styles.splash}>
      <Image source={require('../assets/eg-eloma-mark-light.png')} style={{ width: 96, height: 96 }} resizeMode="contain" />
    </View>
  );
}

export default function Navigation() {
  const { ready, user } = useAuth();
  if (!ready) return <Splash />;
  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={stackOptions}>
        {user ? (
          <>
            <RootStack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
            <RootStack.Screen name="TaskDetail" component={TaskDetailScreen} options={({ route }: any) => ({ title: route.params?.title ?? 'Task' })} />
            <RootStack.Screen name="TaskChat" component={TaskChatScreen} options={({ route }: any) => ({ title: route.params?.title ?? 'Chat' })} />
            <RootStack.Screen name="CustomerPicker" component={CustomerPickerScreen} options={{ title: 'Choose customer', presentation: 'modal' }} />
          </>
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
