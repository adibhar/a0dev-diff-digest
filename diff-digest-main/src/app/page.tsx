"use client"; // Mark as a Client Component
import ReactMarkdown from "react-markdown";

import { useState } from "react";

// Define the expected structure of a diff object
interface DiffItem {
  id: string;
  description: string;
  diff: string;
  url: string; // Added URL field
}

// Define the expected structure of the API response
interface ApiResponse {
  diffs: DiffItem[];
  nextPage: number | null;
  currentPage: number;
  perPage: number;
}

async function generateNotes(
  diff: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  const response = await fetch("/api/notes-generator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diff }),
  });

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let done = false;
  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      buffer += decoder.decode(value);

      const lines = buffer.split("\n");

      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonString = line.slice(6).trim();
          if (jsonString === "[DONE]") return;
          try {
            const parsed = JSON.parse(jsonString);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            console.error("Error parsing OpenAI stream chunk:", e);
          }
        }
      }
    }
  }
}


export default function Home() {
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [initialFetchDone, setInitialFetchDone] = useState<boolean>(false);

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [developerNotes, setDeveloperNotes] = useState<string>("");
  const [marketingNotes, setMarketingNotes] = useState<string>("");
  const [currentPR, setCurrentPR] = useState<DiffItem | null>(null);

  const fetchDiffs = async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sample-diffs?page=${page}&per_page=10`
      );
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.details || errorMsg;
        } catch {
          // Ignore if response body is not JSON
          console.warn("Failed to parse error response as JSON");
        }
        throw new Error(errorMsg);
      }
      const data: ApiResponse = await response.json();
      setDiffs((prev) =>
        page === 1 ? data.diffs : [...prev, ...data.diffs]
      );
      setCurrentPage(data.currentPage);
      setNextPage(data.nextPage);
      if (!initialFetchDone) setInitialFetchDone(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchClick = () => {
    setDiffs([]); // Clear existing diffs when fetching the first page again
    setDeveloperNotes("");
    setMarketingNotes("");
    fetchDiffs(1);
  };

  const handleLoadMoreClick = () => {
    if (nextPage) {
      fetchDiffs(nextPage);
    }
  };

  const handleGenerateNotes = (pr: DiffItem) => {
    setDeveloperNotes("");
    setMarketingNotes("");
    setLoadingId(pr.id);
    setCurrentPR(pr);

    let buffer = "";

    generateNotes(pr.diff, (chunk) => {
      buffer += chunk;
    })
      .then(() => {
        const devMatch = buffer.match(
          /Developer Notes:([\s\S]*?)(?:Marketing Notes:|$)/
        );
        const bizMatch = buffer.match(
          /Marketing Notes:([\s\S]*)/
        );
        if (devMatch && devMatch[1]) {
          let devNotes = devMatch[1].trim();
          {/* remove random characters - chat sometimes adds random separator characters */}
          devNotes = devNotes.replace(/\n##+\s*$/g, "").trim();
          setDeveloperNotes(devNotes);
        }
        if (bizMatch && bizMatch[1]) {
          let bizNotes = bizMatch[1].trim();
          {/* same as above */}
          bizNotes = bizNotes.replace(/\n##+\s*$/g, "").trim();
          setMarketingNotes(bizNotes);
        }
      })
      .catch((err) => {
        console.error("Error generating notes:", err);
        setDeveloperNotes("Failed to generate notes.");
      })
      .finally(() => {
        setLoadingId(null);
      });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Copied to clipboard!");
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 sm:p-24">
      <h1 className="text-4xl font-bold mb-12">Diff Digest ✍️</h1>

      <div className="w-full max-w-4xl space-y-8">
        <div className="flex space-x-4">
          <button
            onClick={handleFetchClick}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {isLoading && currentPage === 1
              ? "Fetching..."
              : "Fetch Latest Diffs"}
          </button>
        </div>

        <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-6 bg-gray-50 dark:bg-gray-800">
          <h2 className="text-2xl font-semibold mb-4">
            Merged Pull Requests
          </h2>

          {error && (
            <div className="text-red-600 bg-red-100 p-3 rounded mb-4">
              Error: {error}
            </div>
          )}

          {!initialFetchDone && !isLoading && (
            <p className="text-gray-600">
              Click &quot;Fetch Latest Diffs&quot; to load merged pull requests.
            </p>
          )}

          {diffs.length > 0 && (
            <ul className="space-y-4">
              {diffs.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center bg-white dark:bg-gray-700 p-4 rounded"
                >
                  <div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                    >
                      PR #{item.id}
                    </a>
                    <span className="ml-2 text-gray-800">
                      {item.description}
                    </span>
                  </div>
                  <button
                    className="mt-2 sm:mt-0 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    onClick={() => handleGenerateNotes(item)}
                    disabled={loadingId !== null}
                  >
                    {loadingId === item.id ? "Generating..." : "Generate Notes"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {isLoading && currentPage > 1 && (
            <p className="text-gray-600 mt-4">
              Loading more pull requests...
            </p>
          )}

          {nextPage && !isLoading && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleLoadMoreClick}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Load More (Page {nextPage})
              </button>
            </div>
          )}
        </div>

        {/* all notes */}

        {developerNotes && (
          <div className="bg-white p-6 rounded shadow space-y-4">
            {/* pr number and name */}
            {currentPR && (
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">
                  Release Notes for{" "}
                  <a
                    href={currentPR.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    PR #{currentPR.id}
                  </a>
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400">{currentPR.description}</p>
              </div>
            )}

            {/* dev notes */}
            <div>
              <h2 className="text-2xl font-bold mb-2">Developer Notes</h2>
              <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded prose dark:prose-invert">
                <ReactMarkdown>{developerNotes}</ReactMarkdown>
              </div>
              <button
                onClick={() => copyToClipboard(developerNotes)}
                className="mt-2 px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Copy Developer Notes
              </button>
            </div>


            {/* marketing notes */}
            <div>
              <h2 className="text-2xl font-bold mb-2">Marketing Notes</h2>
              <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded prose dark:prose-invert">
                <ReactMarkdown>{marketingNotes}</ReactMarkdown>
              </div>
              <button
                onClick={() => copyToClipboard(marketingNotes)}
                className="mt-2 px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Copy Marketing Notes
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
