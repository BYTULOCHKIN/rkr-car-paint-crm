import { SHOW_TEMPLATE_DEMOS } from '@/config/product';
import { useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';
import { useThemeConfig } from '@/components/themes/active-theme';
import { THEMES } from '@/components/themes/theme.config';

const useThemeSwitching = () => {
  const { theme, setTheme } = useTheme();
  const { activeTheme, setActiveTheme } = useThemeConfig();

  const toggleDarkLight = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const cycleTheme = () => {
    const currentIndex = THEMES.findIndex((t) => t.value === activeTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setActiveTheme(THEMES[nextIndex].value);
  };

  const themeActions = [
    {
      id: 'cycleTheme',
      name: 'Switch Theme',
      shortcut: ['t', 't'],
      section: 'Оформлення',
      perform: cycleTheme
    },
    {
      id: 'toggleDarkLight',
      name: 'Змінити світлий / темний режим',
      shortcut: ['t', 'd'],
      section: 'Оформлення',
      perform: toggleDarkLight
    },
    {
      id: 'setLightTheme',
      name: 'Світлий режим',
      section: 'Оформлення',
      perform: () => setTheme('light')
    },
    {
      id: 'setDarkTheme',
      name: 'Темний режим',
      section: 'Оформлення',
      perform: () => setTheme('dark')
    }
  ];

  useRegisterActions(
    themeActions.filter((action) => SHOW_TEMPLATE_DEMOS || action.id !== 'cycleTheme'),
    [theme, activeTheme]
  );
};

export default useThemeSwitching;
