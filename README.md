# @clinkai/dsh-web-search-fallback — 已合并 / deprecated

**功能已合并进 [`@clinkai/dsh-web-search-searxng`](https://github.com/w384/clinkai-dsh-web-search-searxng)。**

那一个包现在同时注册两个 provider：

| provider id | 行为 |
|---|---|
| `searxng` | 纯 SearXNG |
| `search-fallback` | 先问 SearXNG，连接失败 / 内部超时 / HTTP 5xx（可选：空结果）时改走 `fallbackProvider`（默认 `deepseek-official`） |

所以你现在用的 provider id 与配置**一个字都不用改**，换包即可：

```sh
dsh plugin --profile web remove @clinkai/dsh-web-search-fallback
dsh plugin --profile web add github:w384/clinkai-dsh-web-search-searxng
```

本仓库作为"独立的通用回退包装器"保留：如果你想把**其他**主 provider（不是 SearXNG）包一层回退，
它仍然可用（它通过 provider id 在调用时查找，不 import 任何具体 provider）。此后不再更新。

## License

MIT
