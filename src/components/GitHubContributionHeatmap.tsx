
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  AlertCircle,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";

interface Contribution {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface ContributionResponse {
  username: string;
  total: {
    lastYear: number;
  };
  contributions: Contribution[];
}

interface GitHubContributionHeatmapProps {
  isDark: boolean;
}

interface GitHubContributionDay {
  date: string;
  contributionCount: number;
  color: string;
}

interface GitHubContributionWeek {
  contributionDays: GitHubContributionDay[];
}

interface GitHubApiResponse {
  username: string;
  totalContributions: number;
  weeks: GitHubContributionWeek[];
}

type CalendarCell = Contribution | null;

const API_URL = "http://localhost:4000/api/github/contributions";

const levelColors = {
  light: [
    "bg-gray-100",
    "bg-emerald-200",
    "bg-emerald-400",
    "bg-emerald-500",
    "bg-emerald-700",
  ],
  dark: [
    "bg-[#202b37]",
    "bg-emerald-950",
    "bg-emerald-800",
    "bg-emerald-600",
    "bg-emerald-400",
  ],
};

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getContributionLevel(count: number): Contribution["level"] {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

function buildCalendarWeeks(
  contributions: Contribution[]
): CalendarCell[][] {
  if (contributions.length === 0) return [];

  const sorted = [...contributions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const weeks: CalendarCell[][] = [];
  let currentWeek: CalendarCell[] = [];

  const firstDay = new Date(`${sorted[0].date}T12:00:00Z`).getUTCDay();

  for (let i = 0; i < firstDay; i += 1) {
    currentWeek.push(null);
  }

  for (const contribution of sorted) {
    const dayOfWeek = new Date(
      `${contribution.date}T12:00:00Z`
    ).getUTCDay();

    if (currentWeek.length > 0 && dayOfWeek === 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }

      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentWeek.push(contribution);
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }

    weeks.push(currentWeek);
  }

  return weeks;
}

export default function GitHubContributionHeatmap({
  isDark,
}: GitHubContributionHeatmapProps) {
  const [usernameInput, setUsernameInput] = useState("mxhitsharmaa");
  const [activeUsername, setActiveUsername] = useState("mxhitsharmaa");
  const [contributionData, setContributionData] =
    useState<ContributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadContributions = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_URL}?username=${encodeURIComponent(activeUsername)}`,
          { signal }
        );

        const result = (await response.json().catch(() => null)) as
          | GitHubApiResponse
          | { message?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            result && "message" in result
              ? result.message ||
                  `Could not load contributions (HTTP ${response.status}).`
              : `Could not load contributions (HTTP ${response.status}).`
          );
        }

        if (
          !result ||
          !("weeks" in result) ||
          !Array.isArray(result.weeks) ||
          typeof result.totalContributions !== "number"
        ) {
          throw new Error("The API returned an unexpected response.");
        }

        const contributions: Contribution[] = result.weeks.flatMap(
          (week) => {
            if (!Array.isArray(week.contributionDays)) {
              return [];
            }

            return week.contributionDays.map((day) => {
              const count = Number(day.contributionCount) || 0;

              return {
                date: day.date,
                count,
                level: getContributionLevel(count),
              };
            });
          }
        );

        const normalizedData: ContributionResponse = {
          username:
            "username" in result && result.username
              ? result.username
              : activeUsername,
          total: {
            lastYear: result.totalContributions,
          },
          contributions,
        };

        if (!signal.aborted) {
          setContributionData(normalizedData);
        }
      } catch (err) {
        if (signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while loading GitHub contributions."
        );
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [activeUsername]
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadContributions(controller.signal);

    return () => controller.abort();
  }, [loadContributions, refreshKey]);

  const weeks = useMemo(
    () => buildCalendarWeeks(contributionData?.contributions ?? []),
    [contributionData]
  );

  const activeDays = useMemo(
    () =>
      (contributionData?.contributions ?? []).filter(
        (day) => day.count > 0
      ).length,
    [contributionData]
  );

  const bestDay = useMemo(() => {
    const days = contributionData?.contributions ?? [];

    return days.reduce<Contribution | null>((best, day) => {
      if (!best || day.count > best.count) return day;
      return best;
    }, null);
  }, [contributionData]);

  const monthLabels = useMemo(() => {
    let previousMonth = -1;

    return weeks.map((week) => {
      const firstContribution = week.find(
        (day): day is Contribution => day !== null
      );

      if (!firstContribution) return "";

      const date = new Date(`${firstContribution.date}T12:00:00Z`);
      const month = date.getUTCMonth();

      if (month !== previousMonth) {
        previousMonth = month;

        return date.toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        });
      }

      return "";
    });
  }, [weeks]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const username = usernameInput.trim();

    if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
      setError("Enter a valid GitHub username.");
      return;
    }

    setContributionData(null);
    setActiveUsername(username);
  };

  const cardClass = isDark
    ? "border-gray-800 bg-gray-900 text-gray-100"
    : "border-gray-200 bg-white text-gray-900";

  const mutedClass = isDark ? "text-gray-400" : "text-gray-500";
  const cellColors = isDark ? levelColors.dark : levelColors.light;

  return (
    <section
      className={`min-w-0 rounded-2xl border p-5 shadow-sm sm:p-6 ${cardClass}`}
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              isDark
                ? "bg-emerald-950 text-emerald-400"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            <Activity size={22} />
          </div>

          <div>
            <h2 className="text-lg font-semibold">
              GitHub Contribution Activity
            </h2>
            <p className={`mt-1 text-sm ${mutedClass}`}>
              Real contribution data from GitHub
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://github.com/${encodeURIComponent(activeUsername)}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
              isDark
                ? "border-gray-700 hover:bg-gray-800"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            Profile <ExternalLink size={14} />
          </a>

          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
            aria-label="Refresh contributions"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isDark
                ? "border-gray-700 hover:bg-gray-800"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <RefreshCw
              size={15}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSearch}
        className="mt-5 flex flex-col gap-2 sm:flex-row"
      >
        <div
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 ${
            isDark
              ? "border-gray-700 bg-gray-950"
              : "border-gray-200 bg-gray-50"
          }`}
        >
          <Search size={17} className={mutedClass} />

          <input
            type="text"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            placeholder="Enter GitHub username"
            aria-label="GitHub username"
            className={`w-full min-w-0 bg-transparent py-2.5 text-sm outline-none ${
              isDark
                ? "text-gray-100 placeholder:text-gray-500"
                : "text-gray-900 placeholder:text-gray-400"
            }`}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Load Activity
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
            isDark
              ? "border-red-900 bg-red-950/40 text-red-300"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Unable to load contributions</p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        </div>
      )}

      {loading && !contributionData && (
        <div
          className={`flex items-center justify-center gap-2 py-16 ${mutedClass}`}
        >
          <LoaderCircle size={20} className="animate-spin" />
          <span className="text-sm">Loading GitHub activity...</span>
        </div>
      )}

      {!loading && !error && contributionData && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              className={`rounded-xl border p-4 ${
                isDark
                  ? "border-gray-800 bg-gray-950/60"
                  : "border-gray-100 bg-gray-50"
              }`}
            >
              <p className={`text-sm ${mutedClass}`}>
                Contributions · last year
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {contributionData.total.lastYear.toLocaleString()}
              </p>
            </div>

            <div
              className={`rounded-xl border p-4 ${
                isDark
                  ? "border-gray-800 bg-gray-950/60"
                  : "border-gray-100 bg-gray-50"
              }`}
            >
              <p className={`text-sm ${mutedClass}`}>Active days</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {activeDays.toLocaleString()}
              </p>
            </div>

            <div
              className={`rounded-xl border p-4 ${
                isDark
                  ? "border-gray-800 bg-gray-950/60"
                  : "border-gray-100 bg-gray-50"
              }`}
            >
              <p className={`text-sm ${mutedClass}`}>Best day</p>
              <p className="mt-2 text-lg font-bold">
                {bestDay ? bestDay.count.toLocaleString() : "—"}
              </p>
              <p className={`mt-1 text-xs ${mutedClass}`}>
                {bestDay
                  ? formatDate(bestDay.date)
                  : "No activity recorded"}
              </p>
            </div>
          </div>

          <div
            className={`mt-6 rounded-xl border p-4 sm:p-5 ${
              isDark ? "border-gray-800" : "border-gray-200"
            }`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  @{contributionData.username}
                </h3>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  Daily contributions over the last year
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  isDark
                    ? "bg-emerald-950 text-emerald-300"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                Live API data
              </span>
            </div>

            {weeks.length > 0 ? (
              <div className="overflow-x-auto pb-3">
                <div className="min-w-[680px]">
                  <div
                    className="mb-2 grid gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {monthLabels.map((month, index) => (
                      <div
                        key={`${month}-${index}`}
                        className={`whitespace-nowrap text-xs ${mutedClass}`}
                      >
                        {month}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <div
                      className={`flex shrink-0 flex-col justify-around pb-1 pt-0 text-[10px] ${mutedClass}`}
                    >
                      <span>Sun</span>
                      <span>Tue</span>
                      <span>Thu</span>
                      <span>Sat</span>
                    </div>

                    <div className="flex min-w-0 flex-1 gap-[3px]">
                      {weeks.map((week, weekIndex) => (
                        <div
                          key={`week-${weekIndex}`}
                          className="flex min-w-0 flex-1 flex-col gap-[3px]"
                        >
                          {week.map((day, dayIndex) => (
                            <div
                              key={
                                day?.date ??
                                `empty-${weekIndex}-${dayIndex}`
                              }
                              title={
                                day
                                  ? `${day.count} contribution${
                                      day.count === 1 ? "" : "s"
                                    } on ${formatDate(day.date)}`
                                  : undefined
                              }
                              aria-label={
                                day
                                  ? `${day.count} contributions on ${formatDate(day.date)}`
                                  : undefined
                              }
                              className={`aspect-square w-full rounded-[2px] ${
                                day
                                  ? cellColors[
                                      Math.min(4, Math.max(0, day.level))
                                    ]
                                  : "bg-transparent"
                              } ${
                                day
                                  ? "ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.04]"
                                  : ""
                              }`}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className={`py-8 text-center text-sm ${mutedClass}`}>
                No contribution calendar data was returned.
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className={`text-xs ${mutedClass}`}>
                Each square represents one day
              </p>

              <div className="flex items-center gap-1.5">
                <span className={`mr-1 text-xs ${mutedClass}`}>Less</span>

                {cellColors.map((color, index) => (
                  <span
                    key={index}
                    aria-label={`Contribution level ${index}`}
                    className={`h-3 w-3 rounded-[2px] ${color}`}
                  />
                ))}

                <span className={`ml-1 text-xs ${mutedClass}`}>More</span>
              </div>
            </div>
          </div>

          <p className={`mt-4 text-xs leading-relaxed ${mutedClass}`}>
            Counts are supplied by GitHub's contribution calendar for the
            authenticated account. Private activity visibility depends on
            GitHub permissions and privacy settings.
          </p>
        </>
      )}
    </section>
  );
}
