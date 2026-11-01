
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const GITHUB_API = "https://api.github.com";
const DEFAULT_USERNAME = "mxhitsharmaa";

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
    ],
  })
);

app.use(express.json());

function validUsername(username) {
  return /^[a-zA-Z0-9-]{1,39}$/.test(username);
}

function getDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

// GitHub REST API helper
async function githubGet(path) {
  const token = process.env.GITHUB_TOKEN?.trim();

  if (!token) {
    throw new Error("GITHUB_TOKEN is missing in server/.env");
  }

  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || `GitHub API error: ${response.status}`
    );
  }

  return result;
}

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "DevBoard GitHub API server is running.",
  });
});

// 1. GitHub contributions calendar
app.get("/api/github/contributions", async (req, res) => {
  const username = String(
    req.query.username || DEFAULT_USERNAME
  ).trim();

  if (!validUsername(username)) {
    return res.status(400).json({
      message: "Invalid GitHub username.",
    });
  }

  try {
    const token = process.env.GITHUB_TOKEN?.trim();

    if (!token) {
      throw new Error("GITHUB_TOKEN is missing in server/.env");
    }

    const query = `
      query($username: String!) {
        user(login: $username) {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                  color
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        query,
        variables: { username },
      }),
    });

    const result = await response.json();

    if (!response.ok || result.errors?.length) {
      throw new Error(
        result.errors?.map((item) => item.message).join(", ") ||
          `GitHub API error: ${response.status}`
      );
    }

    const user = result.data?.user;

    if (!user) {
      return res.status(404).json({
        message: `GitHub user "${username}" was not found.`,
      });
    }

    const calendar =
      user.contributionsCollection.contributionCalendar;

    return res.json({
      username,
      totalContributions: calendar.totalContributions,
      weeks: calendar.weeks,
    });
  } catch (error) {
    console.error("Contributions API error:", error.message);

    return res.status(502).json({
      message: error.message || "Could not load contributions.",
    });
  }
});

// 2. Programming-language distribution
app.get("/api/github/languages", async (req, res) => {
  const username = String(
    req.query.username || DEFAULT_USERNAME
  ).trim();

  if (!validUsername(username)) {
    return res.status(400).json({
      message: "Invalid GitHub username.",
    });
  }

  try {
    const repos = await githubGet(
      `/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner`
    );

    const totals = {};
    const ownedRepos = repos.filter((repo) => !repo.fork);

    for (let i = 0; i < ownedRepos.length; i += 5) {
      const batch = ownedRepos.slice(i, i + 5);

      const results = await Promise.all(
        batch.map((repo) =>
          githubGet(
            `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/languages`
          )
        )
      );

      for (const languages of results) {
        for (const [name, bytes] of Object.entries(languages)) {
          totals[name] = (totals[name] || 0) + Number(bytes);
        }
      }
    }

    const totalBytes = Object.values(totals).reduce(
      (sum, bytes) => sum + bytes,
      0
    );

    const languages = Object.entries(totals)
      .map(([name, bytes]) => ({
        name,
        bytes,
        percentage: totalBytes
          ? Math.round((bytes / totalBytes) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);

    return res.json({
      username,
      repositoriesScanned: ownedRepos.length,
      languages,
    });
  } catch (error) {
    console.error("Language API error:", error.message);

    return res.status(502).json({
      message: error.message || "Could not load GitHub languages.",
    });
  }
});

// 3. Commit and pull-request activity
app.get("/api/github/activity", async (req, res) => {
  const username = String(
    req.query.username || DEFAULT_USERNAME
  ).trim();

  const range = String(req.query.range || "Weekly");

  if (!validUsername(username)) {
    return res.status(400).json({
      message: "Invalid GitHub username.",
    });
  }

  if (!["Daily", "Weekly", "Monthly"].includes(range)) {
    return res.status(400).json({
      message: "Range must be Daily, Weekly, or Monthly.",
    });
  }

  try {
    const now = new Date();
    const from = new Date(now);

    if (range === "Daily") {
      from.setUTCHours(0, 0, 0, 0);
    } else {
      from.setUTCDate(
        from.getUTCDate() - (range === "Weekly" ? 6 : 29)
      );
      from.setUTCHours(0, 0, 0, 0);
    }

    const startDate = getDateKey(from);
    const endDate = getDateKey(now);

    const commitQuery = new URLSearchParams({
      q: `author:${username} committer-date:${startDate}..${endDate}`,
      per_page: "100",
      sort: "committer-date",
      order: "desc",
    });

    const prQuery = new URLSearchParams({
      q: `author:${username} type:pr created:${startDate}..${endDate}`,
      per_page: "100",
      sort: "created",
      order: "desc",
    });

    const [commitResult, prResult] = await Promise.all([
      githubGet(`/search/commits?${commitQuery.toString()}`),
      githubGet(`/search/issues?${prQuery.toString()}`),
    ]);

    const daily = new Map();

    for (
      let date = new Date(from);
      date <= now;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const key = getDateKey(date);

      daily.set(key, {
        date: key,
        commits: 0,
        pullRequests: 0,
      });
    }

    for (const item of commitResult.items || []) {
      const commitDate =
        item.commit?.committer?.date ||
        item.commit?.author?.date;

      if (!commitDate) continue;

      const entry = daily.get(getDateKey(commitDate));

      if (entry) entry.commits += 1;
    }

    for (const item of prResult.items || []) {
      if (!item.created_at) continue;

      const entry = daily.get(getDateKey(item.created_at));

      if (entry) entry.pullRequests += 1;
    }

    return res.json({
      username,
      range,
      from: startDate,
      to: endDate,
      commitsFound: commitResult.total_count || 0,
      pullRequestsFound: prResult.total_count || 0,
      truncated:
        (commitResult.total_count || 0) > 100 ||
        (prResult.total_count || 0) > 100,
      activity: Array.from(daily.values()),
    });
  } catch (error) {
    console.error("Activity API error:", error.message);

    return res.status(502).json({
      message: error.message || "Could not load GitHub activity.",
    });
  }
});

// 4. GitHub pull requests with pagination
app.get("/api/github/pulls", async (req, res) => {
  const username = String(
    req.query.username || DEFAULT_USERNAME
  ).trim();

  const page = Math.max(
    1,
    Number.parseInt(String(req.query.page || "1"), 10) || 1
  );

  const perPage = 5;

  if (!validUsername(username)) {
    return res.status(400).json({
      message: "Invalid GitHub username.",
    });
  }

  try {
    const query = new URLSearchParams({
      q: `author:${username} type:pr`,
      sort: "created",
      order: "desc",
      per_page: String(perPage),
      page: String(page),
    });

    const result = await githubGet(
      `/search/issues?${query.toString()}`
    );

    return res.json({
      username,
      page,
      perPage,
      totalCount: result.total_count || 0,
      pullRequests: (result.items || []).map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        repository: pr.repository_url
          ? pr.repository_url.split("/").slice(-2).join("/")
          : "",
        createdAt: pr.created_at,
        state:
          pr.state === "closed"
            ? pr.pull_request?.merged_at
              ? "Merged"
              : "Closed"
            : "Open",
        author: pr.user?.login || username,
      })),
    });
  } catch (error) {
    console.error("Pull requests API error:", error.message);

    return res.status(502).json({
      message: error.message || "Could not load pull requests.",
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(
    `DevBoard API server running at http://localhost:${PORT}`
  );
});
