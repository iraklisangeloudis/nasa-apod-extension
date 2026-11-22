# Astronomy Picture of the Day Viewer

An unofficial Chrome extension displaying NASA’s latest APOD with its explanation, credits, and source link.

## Features

- Uses `https://science.nasa.gov/wp-json/wp/v2/apod-basic?per_page=1`.
- Follows the browser/system color preference by default. The theme button cycles **System → Light → Dark**, and remembers your choice. System mode responds to preference changes while the popup is open.
- Displays images (including animated GIFs when NASA supplies a GIF), direct MP4/WebM/OGV video, and supported YouTube/Vimeo embeds extracted from APOD Basic HTML. Videos do not autoplay. Unsupported or blocked media can be viewed through the NASA source link.
- Caches APOD for five minutes, with the last saved entry available if a request fails.
- Retains credit and license links supplied by NASA. An absent copyright field is not treated as proof of public-domain status.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose this folder.
4. Open the extension from Chrome’s toolbar. After updating the files, click **Reload** on its extension card.

## Permissions and data

`storage` saves the theme and cached public APOD content locally. The NASA host permission allows requests to the APOD API. No account or personal API key is used. Media loads from its provider, and supported video embeds connect to YouTube or Vimeo when displayed.

Remote HTML is parsed only to extract media and a small allowlist of text formatting and links; remote scripts and arbitrary frames are not inserted into the popup.

## License

Extension code is MIT licensed; see [LICENSE](LICENSE). APOD media has its own rights and credit requirements. This extension is not affiliated with or endorsed by NASA.
