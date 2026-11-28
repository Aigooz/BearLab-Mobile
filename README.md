# BearLab AI Mobile

BearLab AI 的第三方 Android 和 iOS 客户端。应用使用原生容器和共享移动界面，不代表 BearLab AI 官方。当前版本为 `1.1.0`。

## 功能

- 仪表盘、四位小数余额、实时余额与并发，以及支持精确时间范围的用量分析；今日 Token 使用 M/B 单位时固定展示四位小数。
- 模型广场与渠道状态，包含模型概览、名称/价格/上下文排序、双段价格、缓存价格、收藏和紧凑复制按钮；模型广场不显示厂商信息、最近使用和多余的详情占位，点击模型名称即可查看完整信息。
- 模型状态使用红、黄、绿三种标记，每个模型均可直接复制名称；站内新增分组或渠道会自动发现并同步。
- 登录页可选择记住密码，按账号保存到 Android Keystore 加密存储或 iOS 钥匙串；会话失效时先刷新会话，必要时自动恢复登录。网络临时故障不会直接清除账号，两步验证仍需本人确认；主动退出或移除账号会清除该账号保存的密码。
- 对话一键测试支持整个分组或单模型测试，所选模型全部同时发起，不设 4 路并发或分批队列；真实调用前说明费用、平台限流风险并要求二次确认，失败不重试。逐条显示输入/输出/缓存 Token、Token 合计、首字与实时总耗时。关闭测试窗口或切换页面后继续运行，测试图标用红点/绿点标记状态；切换账号、退出登录或令牌停用时停止。实际传输与接入并发仍受系统网络和服务器限制。
- 对话输入区兼容键盘覆盖与窗口缩小两类布局；Android 使用原生 IME 可见状态，输入时隐藏底部导航，收起键盘后恢复。测试范围为当前令牌所属分组的可用文本模型，不自动测试图片、视频等非文本模型；计时来自客户端，上游未返回的用量显示为破折号。
- iOS 全页面按安全区、320pt 小屏、常见 iPhone/iPad 和横屏压力布局检查；重点覆盖顶部/底部图标中心、长文本换行、弹窗、键盘避让、图表提示与控件交叠。对话空态、标题及提示文字固定行高并禁止系统自动放大；欢迎文案和操作按钮使用纵向布局。
- “我的”集中展示资料、余额、充值、兑换、订阅、订单与账号管理；订单和订阅可直达对应视图，登录、资料与账号页使用同一套原生风格组件。
- 对话工作台支持多回答版本切换、编辑保留旧分支、任意消息重试/收藏/删除、持久草稿、流式空闲超时恢复、思考过程折叠、精确 usage 展示，以及 Markdown/JSON 导入导出；Markdown、KaTeX、代码块和生图结果均可安全渲染，输入区在单行与多行状态下保持稳定对齐。令牌与模型选择列表适配长名称，图标和状态标签保持对齐，令牌和模型选择、历史对话及输入区图标在双端保持居中。
- 调用记录的延迟按 Sub2API 标准分档：首字 0–10 秒为绿色、10–30 秒为黄色、30–60 秒为橙色、超过 60 秒为红色；总耗时 0–60 秒为绿色、60–180 秒为黄色、180–300 秒为橙色、超过 300 秒为红色。首字与总耗时独立标色，输出 TPS 不参与标色。
- 充值中心按站内实时商品生成统一订阅列表；支持余额支付的商品会自动显示，不会写死具体套餐；金额预设跟随站内活动动态生成。
- 仪表盘、令牌并发和运行质量数据定时刷新；切换页面时复用已加载内容，减少重复等待。
- 兑换码区分订阅与余额；主题可独立切换明暗外观，顶部操作区与底部磨砂玻璃导航支持轻量果冻切换动效。
- Android 可通过 GitHub Releases 检查、下载并唤起系统安装器更新；仅接受 `Aigooz/BearLab-Mobile` 的正式 Release、固定资产名和 SHA-256，下载后再次校验包名、版本与签名。iOS 需自行签名，更新页提供最新 Release 入口。

## 安装

本项目不声明 BearLab AI 官方发布仓库。自行构建时使用以下产物：

- Android：`BearLab-AI-release.apk`。调试构建为 `BearLab-AI-debug.apk`。
- iOS：`BearLab-AI-iOS-unsigned.ipa`。该文件不能直接安装，需使用自己的 Apple ID 等方式签名；设备要求 iOS 15 或更新版本。详见 [iOS 安装与构建说明](ios/README.md)。

安装包更新时需要自行核对下载来源、包名和签名。Android 保留包名 `com.ppapi.mobile`，iOS 保留 Bundle ID `com.ppapi.mobile`，以支持覆盖安装；更换签名后通常需要卸载重装。

## 项目结构

- `app/src/main/assets/www/`：双端共享界面、业务逻辑和离线资源。
- `app/src/main/java/`：Android 容器与支付页面。
- `ios/`：iOS 工程和原生桥接。
- `tests/`：BearLab 接口契约、界面和业务流程验证。
- `.github/workflows/`：iOS 云端构建及模拟器检查。

对话数据使用 `chat-store.js` 管理。旧版线性 `messages` 会在首次打开时迁移为消息节点；每个助手节点保存多个回答版本和 `selectIndex`。请求上下文始终根据当前选中的节点组装，因此切换回答版本不会改写原始消息，编辑用户消息也会保留旧分支。

## 本地开发与测试

需要 Node.js、npm，以及 Playwright 所需的浏览器：

```sh
npm ci
npx playwright install chromium webkit
npm run preview
npm test
```

iOS/WebKit 布局专项回归可单独运行：`npm run test:ios-layout`。该检查覆盖模拟 iPhone/iPad 尺寸和安全区，不替代真机目测与触控测试。

真实服务只读测试需要自行设置 `PP_TEST_EMAIL` 和 `PP_TEST_PASSWORD` 后运行 `npm run test:live`；不要把凭据提交到仓库。模拟数据测试不需要真实账号。`npm run test:legacy` 仅保留仍可维护的历史交互回归，默认 `npm test` 运行 BearLab 契约测试。

## 构建与发布

Android 需要 JDK 17 或 21、Android SDK 35 和 Gradle 8.9。在配置 SDK 后运行 `gradle assembleRelease`，产物为 `app/build/outputs/apk/release/BearLab-AI-release.apk`。本地构建沿用当前 debug 签名以兼容已安装版本；CI 通过 `BEARLAB_KEYSTORE_FILE`、`BEARLAB_KEYSTORE_PASSWORD`、`BEARLAB_KEY_ALIAS`、`BEARLAB_KEY_PASSWORD` 使用受保护的同一签名。更换签名会导致无法覆盖安装，用户需卸载重装并可能丢失本地数据。

iOS 需要 macOS、Xcode 16 或更新版本；打开 `ios/PpApiMobile.xcodeproj`，或手动运行 `Build iOS package` 工作流。工作流生成未签名 IPA，并构建和启动模拟器。签名分发需要相应 Apple 开发者配置。

发布时递增 Android `versionCode`、`versionName` 与 iOS `CURRENT_PROJECT_VERSION`、`MARKETING_VERSION`，运行测试并检查签名。若自行创建 Release，请同步资产名 `BearLab-AI-release.apk` 与 `BearLab-AI-iOS-unsigned.ipa`，并在分发前计算和公布 SHA-256。

## 数据与第三方组件

会话由 Android Keystore 或 iOS 钥匙串保护；浏览器预览不等同于原生安全存储。请勿提交账号、令牌、签名密钥或构建产物。随应用分发的第三方组件许可证位于 `app/src/main/assets/www/vendor/licenses/` 和 `app/src/main/assets/www/js/THIRD-PARTY-LICENSES.txt`。

聊天记录存放在按账号隔离的 WebView 本地存储，不会上传到项目仓库。应用不会持久化明文密码；聊天存储达到容量限制时会优先保留最近会话，并支持从对话设置导出 JSON 备份。
