# CJGrok - Grok Imagine Post Manager

A Chrome extension to manage and delete your Grok Imagine posts. View all your posts in a gallery, delete individual posts, or bulk delete them all.

## Features

- 📸 **Gallery View**: Browse all your Grok Imagine posts in a grid layout
- 🖼️ **Thumbnail Preview**: See post thumbnails with prompts and creation dates
- 🗑️ **Delete Posts**: Delete individual posts or bulk delete all posts sequentially
- 🔒 **Privacy Control**: Take control of your Grok Imagine posts
- 🎨 **Beautiful UI**: Modern, semi-transparent design with blur effects
- ⚡ **Easy Access**: Quick access button on the Imagine page or via extension popup

## Installation

1. Download the latest release from [GitHub Releases](https://github.com/charanjit-singh/cjgrok/releases)
2. Extract the zip file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked" and select the extracted folder

## Usage

1. Navigate to [https://grok.com/imagine](https://grok.com/imagine)
2. Click the "All Posts" button in the bottom-right corner, or
3. Click the extension icon and select "Open All Posts"
4. Browse your posts, click any post to view it, or use the delete button to remove posts

## Privacy & Security

This extension addresses privacy concerns with Grok Imagine posts. For more information:

- 📰 [Reddit Discussion: Grok Imagine Privacy Issue and Fix](https://www.reddit.com/r/grok/comments/1prkx6v/grok_imagine_privacy_issue_and_fix/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- 🎥 [YouTube Video: Grok Imagine Privacy](https://www.youtube.com/watch?v=jpvE9dfU75g&feature=youtu.be)

## Development

```bash
# Install dependencies
pnpm install

# Development mode with watch
pnpm run dev

# Build for production
pnpm run build

# Create zip file
pnpm run zip

# Version management (semver)
pnpm run version:patch  # 1.2.0 -> 1.2.1
pnpm run version:minor  # 1.2.0 -> 1.3.0
pnpm run version:major  # 1.2.0 -> 2.0.0

# Release (creates git tag and pushes)
pnpm run release:patch
pnpm run release:minor
pnpm run release:major
```

## Release Process

Releases are automated via GitHub Actions:

1. **Automatic**: Push a tag starting with `v` (e.g., `v1.2.0`) to trigger a release
2. **Manual**: Use GitHub Actions workflow dispatch with a version number

The workflow will:
- Build the extension
- Create a zip file
- Create a GitHub release with the zip file attached

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Made with ❤️ by [@cjsingg](https://x.com/cjsingg)
