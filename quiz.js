// ── QUIZ DATA ──────────────────────────────────────────────
const quizzes = {
  vocabulary: [
    { q: "What is the synonym of 'brave'?", a: ["Cowardly", "Fearful", "Courageous", "Lazy"], correct: 2 },
    { q: "Choose the correct meaning of 'enormous':", a: ["Tiny", "Huge", "Average", "Small"], correct: 1 },
    { q: "Select the correct spelling:", a: ["Acheivement", "Achievement", "Achievment", "Acheevment"], correct: 1 },
    { q: "'Rapid' means:", a: ["Slow", "Fast", "Cold", "Heavy"], correct: 1 },
    { q: "What is the antonym of 'ancient'?", a: ["Old", "Modern", "Historical", "Past"], correct: 1 }
  ],
  grammar: [
    { q: "Choose the correct sentence:", a: ["He go to school daily.", "He goes to school daily.", "He going to school."], correct: 1 },
    { q: "Select the past tense of 'eat':", a: ["Ate", "Eated", "Eaten"], correct: 0 },
    { q: "Which is correct?", a: ["She don't like coffee.", "She doesn't like coffee.", "She not like coffee."], correct: 1 },
    { q: "Fill in the blank: 'They ___ playing football now.'", a: ["is", "am", "are"], correct: 2 }
  ],
  reading: [
    {
      q: "Ravi loves to plant trees and waters them daily. What does this show?",
      a: ["He hates nature.", "He takes care of nature.", "He is careless."],
      correct: 1
    },
    {
      q: "The teacher praised Priya for always finishing her homework on time. What quality does Priya have?",
      a: ["Laziness", "Responsibility", "Carelessness"],
      correct: 1
    },
    {
      q: "The library was quiet. Everyone was reading. What kind of place is a library?",
      a: ["A noisy market", "A place for silent study and reading", "A sports arena"],
      correct: 1
    }
  ]
};

let currentQuiz = [];
let currentCategory = "";

// ── LOAD QUIZ ──────────────────────────────────────────────
function loadQuiz(category) {
  currentQuiz = quizzes[category];
  currentCategory = category;

  trackAttendance(category);

  const titles = { vocabulary: "📚 Vocabulary Quiz", grammar: "✍️ Grammar Quiz", reading: "📖 Reading & Comprehension Quiz" };
  document.getElementById("quiz-title").innerText = titles[category] || category.toUpperCase() + " QUIZ";

  const box = document.getElementById("question-box");
  box.innerHTML = "";

  currentQuiz.forEach((item, i) => {
    box.innerHTML += `
      <div class="question">
        <p>${i + 1}. ${item.q}</p>
        ${item.a.map((opt, j) =>
          `<label><input type="radio" name="q${i}" value="${j}" /> ${opt}</label>`
        ).join("")}
      </div>
    `;
  });

  document.getElementById("result").innerText = "";
  document.getElementById("quiz-area").classList.remove("hidden");
  document.getElementById("quiz-area").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── ATTENDANCE TRACKING ────────────────────────────────────
function trackAttendance(category) {
  const attendance = JSON.parse(localStorage.getItem("quizAttendance")) || [];
  attendance.push({
    quiz: category,
    date: new Date().toDateString(),
    time: new Date().toLocaleTimeString(),
    status: "started"
  });
  localStorage.setItem("quizAttendance", JSON.stringify(attendance));
}

// ── SUBMIT QUIZ ────────────────────────────────────────────
async function submitQuiz() {
  let score = 0;
  let allAnswered = true;

  currentQuiz.forEach((item, i) => {
    const selected = document.querySelector(`input[name="q${i}"]:checked`);
    if (!selected) { allAnswered = false; return; }
    if (Number(selected.value) === item.correct) score++;
  });

  if (!allAnswered) {
    document.getElementById("result").innerText = "⚠️ Please answer all questions before submitting.";
    document.getElementById("result").style.color = "#e8357a";
    return;
  }

  const total = currentQuiz.length;
  const percent = Math.round((score / total) * 100);

  const msg = percent >= 80 ? "🎉 Excellent!" : percent >= 60 ? "👍 Good job!" : "📚 Keep practicing!";
  document.getElementById("result").innerText = `${msg} You scored ${score}/${total} (${percent}%)`;
  document.getElementById("result").style.color = percent >= 60 ? "var(--green)" : "var(--pink)";

  saveLocalResult(score, percent, total);
  await saveQuizResult(score, percent, total);
}

// ── SAVE LOCAL RESULT ──────────────────────────────────────
function saveLocalResult(score, percent, total) {
  const results = JSON.parse(localStorage.getItem("quizResults")) || [];
  results.push({
    quiz: currentCategory,
    score,
    percent,
    total,
    date: new Date().toDateString(),
    time: new Date().toLocaleTimeString()
  });
  localStorage.setItem("quizResults", JSON.stringify(results));

  // Update streak
  const today = new Date().toDateString();
  const lastDate = localStorage.getItem("lastStudyDate");
  let streak = Number(localStorage.getItem("streak")) || 0;
  if (lastDate !== today) {
    streak += 1;
    localStorage.setItem("streak", streak);
    localStorage.setItem("lastStudyDate", today);
  }
}

// ── SAVE TO AWS (with graceful fallback) ───────────────────
async function saveQuizResult(score, percent, total) {
  const payload = {
    userEmail: localStorage.getItem("userEmail") || "student@example.com",
    activityType: "quiz",
    quizCategory: currentCategory,
    progress: { score, percent, total, completedAt: new Date().toISOString() }
  };

  const apiUrl = "https://iccv9nzcz2.execute-api.us-east-1.amazonaws.com/prod/SaveUserProgress";

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("AWS saved:", await res.json());
  } catch (err) {
    console.warn("AWS unavailable — result saved locally only.");
  }
}
