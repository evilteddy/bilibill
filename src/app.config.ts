export default defineAppConfig({
  pages: [
    'pages/groups/list/index',
    'pages/groups/detail/index',
    'pages/groups/create/index',
    'pages/groups/join/index',
    'pages/groups/invite/index',
    'pages/bills/manual/index',
    'pages/bills/ocr/index',
    'pages/bills/detail/index',
    'pages/profile/index',
    'pages/legal/index',
  ],
  tabBar: {
    color: '#8e8e93',
    selectedColor: '#007AFF',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/groups/list/index',
        text: '群组',
        iconPath: 'assets/tab-groups.png',
        selectedIconPath: 'assets/tab-groups-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tab-profile.png',
        selectedIconPath: 'assets/tab-profile-active.png',
      },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '一键分账',
    navigationBarTextStyle: 'black',
  },
})
