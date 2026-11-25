import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabBar, type TabMeta } from '../tabBar';
import NotificationsScreen from '../screens/NotificationsScreen';
import CustomerPickerScreen from '../screens/CustomerPickerScreen';
import { AdminThreadScreen } from './shared';
import type { AdminRoute } from './types';
import * as dashboard from './dashboard';
import * as customers from './customers';
import * as tasks from './tasks';
import * as billing from './billing';
import * as team from './team';
import * as products from './products';
import * as vault from './vault';
import * as feedback from './feedback';
import * as company from './company';
import * as settings from './settings';
import AdminMoreScreen from './more/AdminMoreScreen';
import AdminProfileScreen from './more/AdminProfileScreen';

const Tab = createBottomTabNavigator();
const MoreStack = createNativeStackNavigator();
const plain = { headerShown: false, contentStyle: { backgroundColor: '#fff' } } as const;

const TABS: TabMeta = {
  Dashboard: { label: 'Dashboard', icon: 'grid-outline', iconOn: 'grid' },
  Customers: { label: 'Customers', icon: 'business-outline', iconOn: 'business' },
  Tasks: { label: 'Tasks', icon: 'list-outline', iconOn: 'list' },
  Billing: { label: 'Billing', icon: 'receipt-outline', iconOn: 'receipt' },
  More: { label: 'More', icon: 'menu-outline', iconOn: 'menu' },
};

// The More tab keeps "Profile" so the app bar's avatar works as in the client app.
function MoreNav() {
  return (
    <MoreStack.Navigator screenOptions={plain}>
      <MoreStack.Screen name="MoreHome" component={AdminMoreScreen} />
      <MoreStack.Screen name="Profile" component={AdminProfileScreen} />
    </MoreStack.Navigator>
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator
      tabBar={(p) => <TabBar {...p} tabs={TABS} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#fff' } }}
    >
      <Tab.Screen name="Dashboard" component={dashboard.Home} />
      <Tab.Screen name="Customers" component={customers.Home} />
      <Tab.Screen name="Tasks" component={tasks.Home} />
      <Tab.Screen name="Billing" component={billing.Home} />
      <Tab.Screen name="More" component={MoreNav} />
    </Tab.Navigator>
  );
}

/** Root-stack screens of the admin app ("Main" is the tabs, as in the client app). */
export const adminRootScreens: AdminRoute[] = [
  { name: 'Main', component: AdminTabs },
  { name: 'AdminThread', component: AdminThreadScreen },
  { name: 'Notifications', component: NotificationsScreen },
  { name: 'CustomerPicker', component: CustomerPickerScreen },
  ...dashboard.routes,
  ...customers.routes,
  ...tasks.routes,
  ...billing.routes,
  ...team.routes,
  ...products.routes,
  ...vault.routes,
  ...feedback.routes,
  ...company.routes,
  ...settings.routes,
];
