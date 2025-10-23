export default (msg) => {
  const parser = new DOMParser();
  let content = msg.content;
  if (content?.trim().match(/\w+:\n</)) {
    content = content.trim().replace(/\w+:\n/, '')
  }
  if (!content.startsWith("<")) {
    return
  }
  const xml = parser.parseFromString(content, "application/xml");
  if (msg.type === 'voice') {
    return {
      buf_id: xml.querySelector('bufid')?.textContent,
    }
  }
}