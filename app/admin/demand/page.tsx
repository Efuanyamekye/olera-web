"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

type SortField = "city" | "state" | "count" | "new_this_week" | "latest_published";
type SortDir = "asc" | "desc";

interface CityRow {
  city: string;
  state: string;
  count: number;
  new_this_week: number;
  latest_published: string;
}

interface DemandData {
  cities: CityRow[];
  total_public: number;
  total_cities: number;
  new_this_week: number;
}

function SortHeader({
  field,
  label,
  align = "left",
  activeField,
  activeDir,
  onSort,
}: {
  field: SortField;
  label: string;
  align?: "left" | "right";
  activeField: SortField;
  activeDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const active = activeField === field;
  return (
    <th
      className={`px-4 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          <svg
            className="w-3.5 h-3.5 text-gray-900"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {activeDir === "desc" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            )}
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        )}
      </span>
    </th>
  );
}

export default function AdminDemandPage() {
  const router = useRouter();
  const [data, setData] = useState<DemandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/demand");
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        setData(json);
      } catch {
        setError("Failed to load demand data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      // Default sort direction per field type
      setSortDir(field === "city" || field === "state" ? "asc" : "desc");
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.cities;

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.city.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q)
      );
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "city":
          cmp = a.city.localeCompare(b.city);
          break;
        case "state":
          cmp = a.state.localeCompare(b.state) || a.city.localeCompare(b.city);
          break;
        case "count":
          cmp = a.count - b.count;
          break;
        case "new_this_week":
          cmp = a.new_this_week - b.new_this_week;
          break;
        case "latest_published":
          cmp =
            new Date(a.latest_published).getTime() -
            new Date(b.latest_published).getTime();
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return rows;
  }, [data, search, sortField, sortDir]);

  function handleRowClick(row: CityRow) {
    const params = new URLSearchParams({ filter: "public" });
    if (row.city === "Location not set") {
      params.set("city", "__null__");
    } else {
      params.set("city", row.city);
    }
    if (row.state) {
      params.set("state", row.state);
    }
    router.push(`/admin/care-seekers?${params}`);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Demand Map</h1>
        <p className="text-sm text-gray-500 mt-1">
          Care seekers with public profiles, grouped by city
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Public Profiles</p>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? "—" : data?.total_public ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Cities with Demand</p>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? "—" : data?.total_cities ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">New This Week</p>
          <p className="text-2xl font-bold text-emerald-600">
            {loading ? "—" : data?.new_this_week ?? 0}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search cities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {search
              ? "No cities match your search"
              : "No care seekers have published their profiles yet"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <SortHeader field="city" label="City" activeField={sortField} activeDir={sortDir} onSort={handleSort} />
                  <SortHeader field="state" label="State" activeField={sortField} activeDir={sortDir} onSort={handleSort} />
                  <SortHeader field="count" label="Public Profiles" align="right" activeField={sortField} activeDir={sortDir} onSort={handleSort} />
                  <SortHeader field="new_this_week" label="New This Week" align="right" activeField={sortField} activeDir={sortDir} onSort={handleSort} />
                  <SortHeader field="latest_published" label="Latest Go-Live" align="right" activeField={sortField} activeDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <tr
                    key={`${row.city}-${row.state}`}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(row)}
                  >
                    <td className="px-4 py-3">
                      {row.city === "Location not set" ? (
                        <span className="italic text-gray-400">
                          Location not set
                        </span>
                      ) : (
                        <span className="font-medium text-gray-900">
                          {row.city}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.state || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs font-semibold">
                        {row.count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.new_this_week > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold">
                          +{row.new_this_week}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {new Date(row.latest_published).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          Showing {filtered.length} of {data?.total_cities ?? 0} cities
        </p>
      )}
    </div>
  );
}
