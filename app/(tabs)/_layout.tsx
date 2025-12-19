import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { Shadows } from '@/app/ui/theme';
import { GradientBackground } from '@/components/ui/gradient-background';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useBreakpoints } from '@/hooks/use-breakpoints';

function TabLayout() {
  const colorScheme = useColorScheme();
  const session = useAuthSession();
  const S = Shadows;
  const { isDesktop, isTablet } = useBreakpoints();
  const horizontalInset = isDesktop ? 120 : isTablet ? 64 : 16;
  const tabBarStyle = {
    position: 'absolute',
    left: horizontalInset,
    right: horizontalInset,
    bottom: isDesktop ? 24 : 12,
    borderTopWidth: 0,
    height: isDesktop ? 80 : 74,
    paddingTop: isDesktop ? 12 : 10,
    paddingBottom: isDesktop ? 18 : 14,
    paddingHorizontal: 12,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    ...S.card,
  };
  const tabBarLabelStyle = {
    fontSize: isDesktop ? 13 : 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  };
  const tabBarItemStyle = {
    paddingVertical: isDesktop ? 6 : 4,
  };

  const buildTabIcon = (symbol: Parameters<typeof IconSymbol>[0]['name']) => {
    const TabIcon = ({ color, focused }: { color: string; focused: boolean }) => (
      <GradientBackground
        colors={
          focused
            ? ['rgba(255, 255, 255, 0.92)', 'rgba(241, 182, 255, 0.85)', 'rgba(122, 95, 255, 0.55)']
            : ['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)']
        }
        blur={focused ? 0.35 : 0.2}
        style={[
          tabStyles.iconWrapper,
          focused ? tabStyles.iconWrapperFocused : tabStyles.iconWrapperUnfocused,
        ]}
      >
        <IconSymbol size={24} name={symbol} color={color} />
      </GradientBackground>
    );
    TabIcon.displayName = `TabIcon:${symbol}`;
    return TabIcon;
  };

  if (!session.email) {
    return <Redirect href="/welcome" />;
  }

  if (!session.verified) {
    return <Redirect href={{ pathname: '/verify-email', params: { email: session.email } }} />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tabIconSelected,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: false,
        tabBarStyle,
        tabBarLabelStyle,
        tabBarItemStyle,
        tabBarShowLabel: false,
        tabBarBackground: () => (
          <GradientBackground
            colors={['#FFFFFF', '#FFFFFF']}
            style={[StyleSheet.absoluteFillObject, tabStyles.tabBackground]}
          />
        ),
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: buildTabIcon('house.fill'),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Publier',
          tabBarIcon: buildTabIcon('car.fill'),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: buildTabIcon('bubble.left.and.bubble.right.fill'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Mon profil',
          tabBarIcon: buildTabIcon('person.crop.circle'),
        }}
      />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabBackground: {
    borderRadius: 26,
  },
  iconWrapperFocused: {
    shadowColor: '#7A5FFF',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  iconWrapperUnfocused: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
});

TabLayout.displayName = 'TabLayout';

export default TabLayout;
