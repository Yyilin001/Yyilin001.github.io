import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";

const root = process.cwd();
const postsDir = path.join(root, "posts");
const srcDir = path.join(root, "src");
const templatesDir = path.join(srcDir, "templates");
const pagesDir = path.join(srcDir, "pages");
const assetsDir = path.join(srcDir, "assets");
const distDir = path.join(root, "dist");

const site = JSON.parse(
  await fs.readFile(path.join(root, "site.config.json"), "utf8")
);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

const normalizeSiteUrl = (value = "") => value.replace(/\/+$/, "");

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

const emptyDir = async (dir) => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
};

const copyDir = async (from, to) => {
  await ensureDir(to);
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
};

const readTemplate = (name) =>
  fs.readFile(path.join(templatesDir, name), "utf8");

const escapeHtml = (value = "") =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const slugify = (value = "") =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "");

const fill = (template, data) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");

const urlFor = (pathname = "/") => {
  const base = site.basePath || "";
  if (/^https?:\/\//.test(pathname)) return pathname;
  return `${base}${pathname}`.replace(/\/{2,}/g, "/");
};

const absoluteUrlFor = (pathname = "/") => {
  const baseUrl = normalizeSiteUrl(site.siteUrl || "");
  if (!baseUrl) {
    return "";
  }
  return new URL(urlFor(pathname), `${baseUrl}/`).href;
};

const getReadingTime = (raw = "") =>
  `${Math.max(1, Math.ceil(raw.replace(/\s+/g, "").length / 450))} 分钟阅读`;

const renderNav = () =>
  site.nav
    .map((item) => {
      const isExternal = /^https?:\/\//.test(item.href);
      const href = isExternal ? item.href : urlFor(item.href);
      const attrs = isExternal ? ' target="_blank" rel="noreferrer"' : "";
      return `<a href="${href}"${attrs}>${escapeHtml(item.label)}</a>`;
    })
    .join("");

const renderTags = (tags = []) =>
  tags
    .map(
      (tag) =>
        `<a class="tag" href="${urlFor(`/tags/${slugify(tag)}.html`)}">${escapeHtml(tag)}</a>`
    )
    .join("");

const renderArticleCard = (post) => `
  <article class="post-card">
    <p class="post-card__meta">${escapeHtml(post.date)} · ${escapeHtml(post.readingTime)}</p>
    <h2 class="post-card__title">
      <a href="${urlFor(`/articles/${post.slug}.html`)}">${escapeHtml(post.title)}</a>
    </h2>
    <p class="post-card__desc">${escapeHtml(post.description)}</p>
    <div class="post-card__tags">${renderTags(post.tags)}</div>
  </article>
`;

const renderLayout = async ({
  pageTitle,
  pageDescription,
  pagePath = "/",
  pageType = "website",
  bodyClass = "",
  content
}) => {
  const layout = await readTemplate("layout.html");
  const canonicalUrl = absoluteUrlFor(pagePath);

  return fill(layout, {
    lang: "zh-CN",
    pageTitle: escapeHtml(pageTitle),
    pageDescription: escapeHtml(pageDescription || site.description),
    siteTitle: escapeHtml(site.title),
    canonicalUrl: escapeHtml(canonicalUrl),
    pageUrl: escapeHtml(canonicalUrl),
    pageType,
    nav: renderNav(),
    content,
    year: String(new Date().getFullYear()),
    bodyClass,
    basePath: site.basePath || "",
    siteUrl: site.siteUrl || "",
    rssUrl: escapeHtml(urlFor("/rss.xml"))
  });
};

const readPosts = async () => {
  const files = await fs.readdir(postsDir);
  const mdFiles = files.filter((name) => name.endsWith(".md"));
  const seenSlugs = new Set();
  const posts = [];

  for (const file of mdFiles) {
    const raw = await fs.readFile(path.join(postsDir, file), "utf8");
    const { data, content } = matter(raw);

    if (!data.title || !data.date || !data.slug) {
      throw new Error(`Post ${file} is missing one of: title, date, slug`);
    }
    if (data.draft === true) continue;
    if (seenSlugs.has(data.slug)) {
      throw new Error(`Duplicate slug detected: ${data.slug}`);
    }
    seenSlugs.add(data.slug);

    posts.push({
      title: String(data.title),
      date: String(data.date),
      description: String(data.description || ""),
      slug: String(data.slug),
      tags: Array.isArray(data.tags) ? data.tags : [],
      readingTime: getReadingTime(content),
      contentHtml: md.render(content)
    });
  }

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return posts;
};

const getTagGroups = (posts) => {
  const groups = new Map();

  for (const post of posts) {
    for (const tag of post.tags) {
      const key = slugify(tag);
      if (!groups.has(key)) {
        groups.set(key, { name: tag, slug: key, posts: [] });
      }
      groups.get(key).posts.push(post);
    }
  }

  return groups;
};

const buildHome = async (posts) => {
  const template = await readTemplate("home.html");
  const tagGroups = [...getTagGroups(posts).values()]
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(
      (group) =>
        `<a class="hero-tag" href="${urlFor(`/tags/${group.slug}.html`)}">${escapeHtml(group.name)} <span>${group.posts.length}</span></a>`
    )
    .join("");

  const content = fill(template, {
    introTitle: escapeHtml(site.title),
    introText: escapeHtml(site.description),
    latestPosts: posts.slice(0, 6).map(renderArticleCard).join(""),
    postCount: String(posts.length),
    tagCount: String(getTagGroups(posts).size),
    featuredTags: tagGroups
  });

  const page = await renderLayout({
    pageTitle: site.title,
    pageDescription: site.description,
    pagePath: "/",
    bodyClass: "page-home",
    content
  });

  await fs.writeFile(path.join(distDir, "index.html"), page);
};

const buildArticleList = async (posts) => {
  const template = await readTemplate("list.html");
  const content = fill(template, {
    pageHeading: "文章",
    pageIntro: "按时间倒序整理的全部文章。",
    listItems: posts.map(renderArticleCard).join("")
  });

  const page = await renderLayout({
    pageTitle: `文章 - ${site.title}`,
    pageDescription: "全部文章",
    pagePath: "/articles/",
    bodyClass: "page-list",
    content
  });

  const outDir = path.join(distDir, "articles");
  await ensureDir(outDir);
  await fs.writeFile(path.join(outDir, "index.html"), page);
};

const buildArticles = async (posts) => {
  const template = await readTemplate("article.html");
  const outDir = path.join(distDir, "articles");
  await ensureDir(outDir);

  for (const [index, post] of posts.entries()) {
    const prev = posts[index + 1];
    const next = posts[index - 1];
    const prevLink = prev
      ? `<a class="article-pagination__link" href="${urlFor(`/articles/${prev.slug}.html`)}">← ${escapeHtml(prev.title)}</a>`
      : "";
    const nextLink = next
      ? `<a class="article-pagination__link article-pagination__link--next" href="${urlFor(`/articles/${next.slug}.html`)}">${escapeHtml(next.title)} →</a>`
      : "";

    const content = fill(template, {
      title: escapeHtml(post.title),
      date: escapeHtml(post.date),
      description: escapeHtml(post.description),
      tags: renderTags(post.tags),
      readingTime: post.readingTime,
      content: post.contentHtml,
      prevLink,
      nextLink
    });

    const page = await renderLayout({
      pageTitle: `${post.title} - ${site.title}`,
      pageDescription: post.description,
      pagePath: `/articles/${post.slug}.html`,
      pageType: "article",
      bodyClass: "page-article",
      content
    });

    await fs.writeFile(path.join(outDir, `${post.slug}.html`), page);
  }
};

const buildTags = async (posts) => {
  const groups = getTagGroups(posts);

  const template = await readTemplate("list.html");
  const outDir = path.join(distDir, "tags");
  await ensureDir(outDir);

  for (const [slug, group] of groups.entries()) {
    const content = fill(template, {
      pageHeading: `标签：${escapeHtml(group.name)}`,
      pageIntro: `共 ${group.posts.length} 篇文章`,
      listItems: group.posts.map(renderArticleCard).join("")
    });

    const page = await renderLayout({
      pageTitle: `${group.name} - ${site.title}`,
      pageDescription: `${group.name} 标签文章列表`,
      pagePath: `/tags/${slug}.html`,
      bodyClass: "page-tag",
      content
    });

    await fs.writeFile(path.join(outDir, `${slug}.html`), page);
  }
};

const buildStaticPages = async () => {
  const files = await fs.readdir(pagesDir);

  for (const file of files) {
    if (!file.endsWith(".html")) {
      continue;
    }
    const raw = await fs.readFile(path.join(pagesDir, file), "utf8");
    const content = fill(raw, {
      homeUrl: urlFor("/"),
      articlesUrl: urlFor("/articles/")
    });

    const page = await renderLayout({
      pageTitle:
        file === "about.html" ? `关于 - ${site.title}` : `页面未找到 - ${site.title}`,
      pageDescription: site.description,
      pagePath: `/${file}`,
      bodyClass: "page-static",
      content
    });

    await fs.writeFile(path.join(distDir, file), page);
  }
};

const xmlEscape = (value = "") =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const buildSitemap = async (posts) => {
  const urls = [
    absoluteUrlFor("/"),
    absoluteUrlFor("/articles/"),
    absoluteUrlFor("/about.html"),
    ...posts.map((post) => absoluteUrlFor(`/articles/${post.slug}.html`)),
    ...[...getTagGroups(posts).values()].map((group) =>
      absoluteUrlFor(`/tags/${group.slug}.html`)
    )
  ].filter(Boolean);

  const body = urls
    .map(
      (url) => `  <url>
    <loc>${xmlEscape(url)}</loc>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

  await fs.writeFile(path.join(distDir, "sitemap.xml"), xml);
};

const buildRss = async (posts) => {
  const siteUrl = absoluteUrlFor("/") || "";
  const items = posts
    .map((post) => {
      const url = absoluteUrlFor(`/articles/${post.slug}.html`);
      const description = xmlEscape(post.description);
      return `  <item>
    <title>${xmlEscape(post.title)}</title>
    <link>${xmlEscape(url)}</link>
    <guid>${xmlEscape(url)}</guid>
    <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    <description>${description}</description>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xmlEscape(site.title)}</title>
  <link>${xmlEscape(siteUrl)}</link>
  <description>${xmlEscape(site.description)}</description>
  <language>zh-CN</language>
${items}
</channel>
</rss>
`;

  await fs.writeFile(path.join(distDir, "rss.xml"), xml);
};

const buildRobots = async () => {
  const lines = ["User-agent: *", "Allow: /"];
  const sitemapUrl = absoluteUrlFor("/sitemap.xml");

  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  await fs.writeFile(path.join(distDir, "robots.txt"), `${lines.join("\n")}\n`);
};

const main = async () => {
  await emptyDir(distDir);
  await copyDir(assetsDir, path.join(distDir, "assets"));

  const posts = await readPosts();
  await buildHome(posts);
  await buildArticleList(posts);
  await buildArticles(posts);
  await buildTags(posts);
  await buildStaticPages();
  await buildSitemap(posts);
  await buildRss(posts);
  await buildRobots();

  await fs.writeFile(path.join(distDir, ".nojekyll"), "");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
