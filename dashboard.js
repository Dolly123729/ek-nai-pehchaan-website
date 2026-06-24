document.addEventListener("DOMContentLoaded", loadDashboard);

function loadDashboard() {
  // ── STREAK ─────────────────────────────────────────────
  const streak = Number(localStorage.getItem("streak")) || 0;
  document.getElementById("streakCount").innerText = streak;

  // ── DAILY TASKS ─────────────────────────────────────────
  const taskData = [
    { key: "task1", label: "Practice 10 English words" },
    { key: "task2", label: "Write 1 paragraph in English" },
    { key: "task3", label: "Use 1 AI tool for studying" },
    { key: "task4", label: "Take a quiz or practice grammar" },
    { key: "task5", label: "Do 5 minutes of speaking practice" }
  ];

  const taskList = document.getElementById("taskList");
  taskList.innerHTML = "";

  taskData.forEach(({ key, label }) => {
    const li = document.createElement("li");
    const checked = localStorage.getItem(key) === "true";
    li.innerHTML = `
      <label>
        <input type="checkbox" ${checked ? "checked" : ""}
          onchange="localStorage.setItem('${key}', this.checked); updateStreak();" />
        <span style="${checked ? 'text-decoration:line-through; color:#9ca3af;' : ''}">${label}</span>
      </label>
    `;
    taskList.appendChild(li);
  });

  // ── QUIZ RESULTS ────────────────────────────────────────
  const results = JSON.parse(localStorage.getItem("quizResults")) || [];
  const list = document.getElementById("paragraphList");
  list.innerHTML = "";

  if (results.length === 0) {
    list.innerHTML = `<li style="color:var(--muted); font-size:14px;">No quiz results yet. <a href="quiz.html" style="color:var(--blue);">Take a quiz!</a></li>`;
  } else {
    // Show last 8 results, most recent first
    [...results].reverse().slice(0, 8).forEach(r => {
      const li = document.createElement("li");
      const emoji = r.percent >= 80 ? "🎉" : r.percent >= 60 ? "👍" : "📚";
      li.innerHTML = `
        <span>${emoji} <strong>${capitalise(r.quiz)}</strong>: ${r.score}/${r.total} (${r.percent}%)</span>
        <span style="font-size:12px; color:var(--muted); float:right;">${r.date || ""}</span>
      `;
      list.appendChild(li);
    });
  }

  // ── MOTIVATION ──────────────────────────────────────────
  const quotes = [
    "\"Keep going — your future is bright!\"",
    "\"Small steps every day create big success.\"",
    "\"You are learning for YOU. Keep rising!\"",
    "\"Mistakes are proof that you are trying.\"",
    "\"Every expert was once a beginner.\"",
    "\"Your English is getting better every day!\""
  ];
  const today = new Date().getDay();
  document.getElementById("motivationText").innerText = quotes[today % quotes.length];
}

function updateStreak() {
  // Already handled in quiz.js on quiz completion
}

function clearResults() {
  if (confirm("Clear all quiz results from your history?")) {
    localStorage.removeItem("quizResults");
    loadDashboard();
  }
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}
