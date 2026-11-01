
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header, { type DashboardRange } from "./components/Header";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] =
    useState<DashboardRange>("Weekly");

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDark
          ? "bg-[#080d19] text-slate-100"
          : "bg-[#f8fafc] text-slate-900"
      }`}
    >
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <Sidebar isDark={isDark} />

        {/* Main Layout */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <Header
            isDark={isDark}
            onToggleTheme={() =>
              setIsDark((current) => !current)
            }
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />

          {/* Dashboard Content */}
          <section className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Dashboard
              isDark={isDark}
              selectedRange={dateRange}
              onSelectedRangeChange={setDateRange}
              searchQuery={searchQuery}
            />
          </section>

          {/* Footer */}
          <footer
            className={`mt-auto border-t px-5 py-5 ${
              isDark
                ? "border-slate-800/70 bg-[#080d19] text-slate-500"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 text-xs sm:flex-row">
              <p>
                <span className="font-semibold text-current">
                  DevBoard
                </span>
                <span className="mx-2">·</span>
                Developer Analytics Dashboard
              </p>

              <p>
                Built for developers, by developers.
              </p>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
