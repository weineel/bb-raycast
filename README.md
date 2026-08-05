# Benben AI

中 | [英](README.en.md)

Benben AI 是一款 macOS Raycast 扩展，提供注重隐私的自带密钥（BYOK）AI 对话和翻译功能。

- **Chat** 可以解释词语、回答问题，并支持在当前 Raycast 窗口中继续追问。
- **Quick Translate** 每次运行都会重新读取选中文本或剪贴板内容并开始新的翻译会话，适合绑定
  全局快捷键。
- **Translate** 会流式生成专业的模型译文和简要说明，同时显示独立的 Google、百度参考译文，
  还可以根据补充上下文继续优化模型译文。
- 初始文本按以下顺序读取：命令参数、选中文本、纯文本剪贴板内容、Raycast Fallback Text。
- OpenAI、Anthropic 和 OpenAI 兼容端点共用统一的模型接口；扩展不会静默切换服务商。

## 配置

在 Raycast 中打开任一命令的偏好设置。

### 模型服务商

选择全局默认的服务商和模型。Chat 与 Translate 均可单独覆盖这两项设置。

- **OpenAI：**前往 [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  创建 API 密钥，然后将其填入 `OpenAI API Key`。
- **Anthropic：**前往 [Anthropic Console](https://console.anthropic.com/settings/keys)
  创建 API 密钥，然后将其填入 `Anthropic API Key`。
- **OpenAI-Compatible：**填写服务商的 Base URL、API 密钥以及准确的 Model ID。

预置的 Model ID 仅供参考。不同账号可用的模型可能不同，因此所有 Model ID 均可配置。

### Google 参考翻译

Google 翻译为可选功能。Benben AI 使用官方 Cloud Translation Basic v2 API，不会调用非官方
免费端点。

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 中创建或选择一个项目。
2. 为该项目启用 **Cloud Translation API**。
3. 打开 **APIs & Services → Credentials**，创建 API 密钥，并尽可能将其限制为仅能访问
   Cloud Translation API。
4. 将密钥填入 `Google Cloud Translation API Key`。

如果密钥为空，Google 区域会显示配置提示，模型翻译和百度翻译仍可正常运行。

### 百度参考翻译

百度翻译为可选功能，使用官方通用文本翻译 API。

1. 在[百度翻译开放平台](https://fanyi-api.baidu.com/)注册应用。
2. 复制应用的 **APP ID** 和**密钥**。
3. 将两项内容填入 Benben AI 对应的偏好设置。

如果任一项为空，百度区域会显示配置提示，不影响其他服务。

## 使用方法

### Chat

1. 在 Raycast 中找到 **Chat**，按需填写 `Question` 参数。
2. 按下 Return，直接打开流式 Chat Thread。
3. 使用 **Follow Up**、**Retry Latest Answer**、**Copy**、**Paste** 或
   **Stop Generating** 操作。

参数为空时，Chat 会依次尝试使用选中文本、剪贴板文本或 Raycast Fallback Text。如果均不可用，
扩展会显示只读的输入错误，而不会再打开一个输入表单。

初始问题最多可包含 20,000 个 Unicode 码点。扩展不会人为限制或自动总结追问及完整对话；如果超出
上下文限制，将由所选服务商返回错误。

### Quick Translate

1. 在 Raycast 中为 **Quick Translate** 绑定全局快捷键。
2. 在任意应用中选中文本；没有选中文本时，也可以先复制纯文本。
3. 按下快捷键，直接打开使用 `Default Translation Target` 的全新翻译会话。

每次运行 Quick Translate 都会重新读取文本并发起翻译，即使原文与上次相同。若选中文本与剪贴板
内容不同，优先翻译选中文本。没有可用文本时只显示 HUD，不打开结果页。请勿把连续捕获所用的
全局快捷键绑定到 **Translate**，因为 Raycast 可能恢复该命令仍挂载的旧结果页。

### Translate

1. 在 Raycast 中找到 **Translate**，按需填写 `Source Text` 参数。
2. 可选择 `Target Language` 参数；未选择时使用全局默认语言。
3. 按下 Return，直接打开翻译结果。
4. 在结果列表中切换查看 Model、Google、Baidu 和 Source Text。
5. 使用 **Refine Model Translation** 补充上下文或要求改写译文。

在一次翻译会话中，Source Text 和目标语言保持不变。优化操作只会更新模型译文；Google 和百度结果
始终作为原文的参考译文。若要更改原文或目标语言，请重新运行命令。可以从 Model Translation 的操作
面板查看 Translation Revisions。Source Text 最多可包含 5,000 个 Unicode 码点。

## 隐私

- 请求会从 Raycast 直接发送到对应区域所配置的服务商。
- API 凭据保存在 Raycast 偏好设置中。
- Benben AI 没有后端、分析统计或持久化对话历史。
- 扩展不会记录提示词、Source Text、响应或 API 密钥。
- 关闭命令后，内存中的 Chat Thread 或 Translation Session 会被清除。

所选服务商可能会根据其自身条款和隐私政策处理或保留请求。

## 开发

```bash
pnpm install
pnpm test
pnpm lint
pnpm build
```

提交到 Raycast Store 前，必须将 `package.json` 中的 `author` 字段替换为发布者的 Raycast Store
账号名。
