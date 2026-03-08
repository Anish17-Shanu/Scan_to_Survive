type QuestionSeed = {
  event_config_id: string;
  difficulty_level: number;
  category: string;
  question_text: string;
  correct_answer: string;
  hint_primary: string;
  hint_secondary: string;
  hint_tertiary: string;
  hint_quaternary: string;
  hint_quinary: string;
  active: boolean;
};

type BankEntry = {
  category: string;
  question: string;
  answer: string;
};

const d1Bank: BankEntry[] = [
  { category: "fundamentals", question: "CPU stands for?", answer: "central processing unit" },
  { category: "fundamentals", question: "RAM stands for?", answer: "random access memory" },
  { category: "fundamentals", question: "ROM stands for?", answer: "read only memory" },
  { category: "fundamentals", question: "OS stands for?", answer: "operating system" },
  { category: "fundamentals", question: "1 kilobyte in binary convention equals how many bytes?", answer: "1024" },
  { category: "fundamentals", question: "Binary system uses which two digits?", answer: "0 and 1|0,1|0 1" },
  { category: "fundamentals", question: "Main processing chip of a computer is called?", answer: "cpu" },
  { category: "fundamentals", question: "The physical parts of a computer are called?", answer: "hardware" },
  { category: "fundamentals", question: "Programs and apps are collectively called?", answer: "software" },
  { category: "fundamentals", question: "A tiny picture representing an app is called?", answer: "icon" },

  { category: "digital-life", question: "Technology used for contactless payment by tapping card/phone?", answer: "nfc" },
  { category: "digital-life", question: "One-time password is commonly abbreviated as?", answer: "otp" },
  { category: "digital-life", question: "Two-step login that combines password + OTP is called?", answer: "two factor authentication|2fa" },
  { category: "digital-life", question: "Cloud storage service by Google for files is called?", answer: "google drive|drive" },
  { category: "digital-life", question: "A fake message trying to steal credentials is called?", answer: "phishing" },
  { category: "digital-life", question: "App used in India to store verified digital documents?", answer: "digilocker" },

  { category: "india-tech", question: "Indian instant payment rail by NPCI is called?", answer: "upi" },
  { category: "india-tech", question: "Organization that developed UPI?", answer: "npci|national payments corporation of india" },
  { category: "india-tech", question: "India's 12-digit digital identity program is called?", answer: "aadhaar|aadhar" },
  { category: "india-tech", question: "Authority that issues Aadhaar IDs?", answer: "uidai" },
  { category: "india-tech", question: "Open Network for Digital Commerce is abbreviated as?", answer: "ondc" },
  { category: "india-tech", question: "ISRO mission that soft-landed near moon south pole is called?", answer: "chandrayaan-3|chandrayaan 3" },
  { category: "india-tech", question: "Name announced for Chandrayaan-3 landing site?", answer: "shiv shakti point|shivshakti point" },

  { category: "html", question: "Standard markup language for web page structure?", answer: "html" },
  { category: "css", question: "Language used to style web pages?", answer: "css" },
  { category: "js", question: "Language commonly used for browser-side scripting?", answer: "javascript" },
  { category: "html", question: "HTML tag for hyperlink (without < >)?", answer: "a" },
  { category: "html", question: "HTML tag for image (without < >)?", answer: "img" },
  { category: "css", question: "CSS property used to change text color?", answer: "color" },
  { category: "js", question: "In JavaScript, keyword used to declare a variable with block scope?", answer: "let" },

  { category: "coding-basic", question: "In programming, reusable block of code is called?", answer: "function" },
  { category: "coding-basic", question: "Data type used for true or false values?", answer: "boolean" },
  { category: "python", question: "Python keyword to define a function?", answer: "def" },
  { category: "java", question: "Java keyword to define a class?", answer: "class" },
  { category: "c", question: "C header for printf/scanf?", answer: "stdio.h" }
];

const d2Bank: BankEntry[] = [
  { category: "html", question: "HTTP status code for success?", answer: "200" },
  { category: "html", question: "HTTP status code for not found?", answer: "404" },
  { category: "html", question: "HTTP method usually used to create a resource?", answer: "post" },
  { category: "html", question: "HTTP method used to fetch resource data?", answer: "get" },
  { category: "js", question: "Data format commonly used by REST APIs?", answer: "json" },
  { category: "js", question: "JavaScript method to parse JSON string to object?", answer: "json.parse" },
  { category: "js", question: "JavaScript method to convert object to JSON string?", answer: "json.stringify" },
  { category: "css", question: "CSS model for one-dimensional layout?", answer: "flexbox" },
  { category: "css", question: "CSS model for two-dimensional layout?", answer: "grid" },
  { category: "css", question: "CSS selector for id main?", answer: "#main" },
  { category: "css", question: "CSS selector for class card?", answer: ".card" },

  { category: "sql", question: "SQL command to read data from a table?", answer: "select" },
  { category: "sql", question: "SQL command to add new row?", answer: "insert" },
  { category: "sql", question: "SQL command to modify existing row?", answer: "update" },
  { category: "sql", question: "SQL command to delete row?", answer: "delete" },
  { category: "sql", question: "SQL clause used to filter rows?", answer: "where" },
  { category: "sql", question: "SQL keyword used to sort results?", answer: "order by" },
  { category: "sql", question: "SQL aggregate function to count rows?", answer: "count" },

  { category: "network", question: "Default port for HTTPS?", answer: "443" },
  { category: "network", question: "Default port for HTTP?", answer: "80" },
  { category: "network", question: "Protocol used for secure remote shell?", answer: "ssh" },
  { category: "network", question: "Protocol used to map domain names to IPs?", answer: "dns" },
  { category: "network", question: "Protocol for automatic IP assignment in LAN?", answer: "dhcp" },
  { category: "network", question: "Command to test host reachability?", answer: "ping" },

  { category: "git", question: "Git command to check working tree status?", answer: "git status" },
  { category: "git", question: "Git command to stage all changed files in current dir?", answer: "git add ." },
  { category: "git", question: "Git command to create a commit?", answer: "git commit" },
  { category: "git", question: "Git command to upload commits to remote?", answer: "git push" },

  { category: "os", question: "Linux command to list files?", answer: "ls" },
  { category: "os", question: "Linux command to print current directory?", answer: "pwd" },
  { category: "os", question: "Linux command to create directory?", answer: "mkdir" },

  { category: "security", question: "Converting plaintext into ciphertext using a key is called?", answer: "encryption" },
  { category: "security", question: "One-way digest operation used for integrity verification is called?", answer: "hashing" },

  { category: "india-tech", question: "Platform used in India for FASTag highway toll collection ecosystem?", answer: "fastag" },
  { category: "india-tech", question: "Unified mobile app by NPCI for UPI transfers (short name)?", answer: "bhim" },
  { category: "india-tech", question: "GeM expands to?", answer: "government e marketplace|government e-marketplace" }
];

const d3Bank: BankEntry[] = [
  { category: "js", question: "In JavaScript, typeof null returns?", answer: "object" },
  { category: "js", question: "Array method to add element at end?", answer: "push" },
  { category: "js", question: "Array method to remove last element?", answer: "pop" },
  { category: "js", question: "Promise state before resolve/reject?", answer: "pending" },
  { category: "js", question: "Keyword for immutable binding in JavaScript?", answer: "const" },
  { category: "html", question: "Web protocol for full-duplex communication over one TCP connection?", answer: "websocket" },
  { category: "html", question: "Cross-Origin Resource Sharing abbreviation?", answer: "cors" },

  { category: "sql", question: "JOIN that returns matching rows from both tables?", answer: "inner join" },
  { category: "sql", question: "Can primary key contain NULL? (yes/no)", answer: "no" },
  { category: "sql", question: "Normal form that removes partial dependency?", answer: "2nf|second normal form" },
  { category: "sql", question: "Normal form that removes transitive dependency?", answer: "3nf|third normal form" },
  { category: "sql", question: "SQL clause used to filter grouped rows?", answer: "having" },
  { category: "sql", question: "Database property ensuring all-or-nothing transaction?", answer: "atomicity" },

  { category: "network", question: "Transport protocol that guarantees ordered delivery?", answer: "tcp" },
  { category: "network", question: "Transport protocol without delivery guarantee?", answer: "udp" },
  { category: "network", question: "CIDR suffix for subnet mask 255.255.255.0?", answer: "24" },
  { category: "network", question: "Loopback IPv4 address?", answer: "127.0.0.1" },
  { category: "network", question: "In TCP/IP model, IP belongs to which layer?", answer: "internet layer" },

  { category: "git", question: "Git command to combine another branch into current branch?", answer: "git merge" },
  { category: "git", question: "Git command to temporarily save uncommitted changes?", answer: "git stash" },
  { category: "git", question: "Git command to view unstaged diff?", answer: "git diff" },
  { category: "git", question: "Area between add and commit is called?", answer: "staging area" },

  { category: "security", question: "Attack using fake pages/messages to steal credentials?", answer: "phishing" },
  { category: "security", question: "Least required permissions principle is called?", answer: "least privilege" },
  { category: "security", question: "Token with three dot-separated parts for stateless auth?", answer: "jwt" },

  { category: "python", question: "Python type name of [] is?", answer: "list" },
  { category: "python", question: "Python data structure for key-value pairs?", answer: "dict|dictionary" },
  { category: "python", question: "Python keyword to begin exception handling block?", answer: "try" },

  { category: "java", question: "JVM stands for?", answer: "java virtual machine" },
  { category: "java", question: "Java collection that disallows duplicates?", answer: "set" },
  { category: "java", question: "Java keyword to create object instance?", answer: "new" },

  { category: "c", question: "In C, operator to dereference pointer?", answer: "*" },
  { category: "c", question: "In C, memory allocated with malloc should be released using?", answer: "free" },

  { category: "india-tech", question: "India Stack component used for paperless document storage and sharing?", answer: "digilocker" },
  { category: "india-tech", question: "India's account-aggregator ecosystem is regulated by which financial regulator?", answer: "rbi|reserve bank of india" }
];

const d4Bank: BankEntry[] = [
  { category: "coding", question: "Evaluate: 3 + 4 * 2", answer: "11" },
  { category: "coding", question: "Evaluate: (10 - 4) * 3", answer: "18" },
  { category: "coding", question: "In JavaScript: 5 === '5' gives true or false?", answer: "false" },
  { category: "coding", question: "In JavaScript: 5 == '5' gives true or false?", answer: "true" },
  { category: "coding", question: "If arr=[10,20,30,40], value of arr[2]?", answer: "30" },
  { category: "coding", question: "Highest index in array of length 9?", answer: "8" },

  { category: "html", question: "HTTP status code for conflict?", answer: "409" },
  { category: "html", question: "HTTP status code for internal server error?", answer: "500" },
  { category: "html", question: "Header used to send bearer token?", answer: "authorization" },
  { category: "html", question: "Token prefix in Authorization header for JWT?", answer: "bearer" },

  { category: "js", question: "Frontend library created by Meta for component UIs?", answer: "react" },
  { category: "js", question: "Node.js web framework commonly used for APIs starting with E?", answer: "express" },
  { category: "js", question: "Browser storage persistent across sessions?", answer: "localstorage" },
  { category: "js", question: "Browser storage cleared on tab/session end?", answer: "sessionstorage" },

  { category: "sql", question: "SQL keyword to remove duplicates in SELECT output?", answer: "distinct" },
  { category: "sql", question: "Join returning all left rows plus matching right rows?", answer: "left join" },
  { category: "sql", question: "Transaction command to permanently apply changes?", answer: "commit" },
  { category: "sql", question: "Transaction command to undo uncommitted changes?", answer: "rollback" },

  { category: "network", question: "192.168.x.x range is public or private?", answer: "private" },
  { category: "network", question: "Tool to view network path hop-by-hop?", answer: "traceroute" },
  { category: "network", question: "OSI layer handling end-to-end delivery?", answer: "transport layer" },

  { category: "git", question: "Git command to list branches?", answer: "git branch" },
  { category: "git", question: "Git command to clone repository?", answer: "git clone" },
  { category: "git", question: "Git command to download remote changes without merge?", answer: "git fetch" },
  { category: "git", question: "Modern git command to restore file content?", answer: "git restore" },

  { category: "os", question: "Linux command to change directory?", answer: "cd" },
  { category: "os", question: "Linux command to print file content?", answer: "cat" },
  { category: "os", question: "Traditional Linux command to show running processes?", answer: "ps" },

  { category: "security", question: "Security test simulating real attacker behavior is called?", answer: "penetration testing|pentest" },
  { category: "security", question: "Security model with Confidentiality, Integrity, Availability is called?", answer: "cia triad" },

  { category: "python", question: "Output of Python: 3 // 2", answer: "1" },
  { category: "python", question: "Output of Python: 'A' * 3", answer: "aaa" },
  { category: "python", question: "Python keyword to define anonymous function?", answer: "lambda" },

  { category: "java", question: "Java program entry-point method name?", answer: "main" },
  { category: "java", question: "Java primitive for 64-bit integer?", answer: "long" },
  { category: "java", question: "Java keyword to prevent method overriding?", answer: "final" },

  { category: "c", question: "In C, array indexing starts at?", answer: "0" },
  { category: "c", question: "In C, operator to get variable address?", answer: "&" },

  { category: "india-tech", question: "Indian mission focused on semiconductor ecosystem is called?", answer: "semicon india programme|semicon india" },
  { category: "india-tech", question: "NPCI real-time retail payments system abbreviation?", answer: "upi" }
];

const d5Bank: BankEntry[] = [
  { category: "js", question: "Output of JavaScript: Math.floor(7.9)", answer: "7" },
  { category: "js", question: "Output of JavaScript: [1,2,3].length", answer: "3" },
  { category: "js", question: "Output of JavaScript: 'Tech'.toLowerCase()", answer: "tech" },
  { category: "js", question: "Value of 2 ** 5 in JavaScript", answer: "32" },
  { category: "js", question: "JavaScript method to asynchronously fetch HTTP resources in browser/runtime?", answer: "fetch" },

  { category: "sql", question: "SQL clause order: SELECT ... FROM ... WHERE ... ___ ...", answer: "group by" },
  { category: "sql", question: "SQL function to get maximum value?", answer: "max" },
  { category: "sql", question: "SQL function to get minimum value?", answer: "min" },
  { category: "sql", question: "ACID property ensuring committed data survives crash?", answer: "durability" },
  { category: "sql", question: "Vulnerability where malicious input alters SQL query logic?", answer: "sql injection|sqli" },

  { category: "network", question: "Protocol to securely transfer files over SSH?", answer: "sftp" },
  { category: "network", question: "If subnet mask is /30, total IPv4 addresses in subnet?", answer: "4" },
  { category: "network", question: "If subnet mask is /24, total IPv4 addresses in subnet?", answer: "256" },
  { category: "network", question: "Service usually responsible for name resolution failures?", answer: "dns" },
  { category: "network", question: "Network layer protocol carrying packets between hosts?", answer: "ip" },

  { category: "git", question: "Git command to apply commits from one branch onto another linearly?", answer: "git rebase" },
  { category: "git", question: "Git command to show compact history line-by-line?", answer: "git log --oneline" },
  { category: "git", question: "Git command to show who last changed each line in a file?", answer: "git blame" },
  { category: "git", question: "Git command to pull remote changes and merge?", answer: "git pull" },
  { category: "git", question: "Git command to create and switch to branch feature-x?", answer: "git checkout -b feature-x" },

  { category: "os", question: "Process identifier is abbreviated as?", answer: "pid" },
  { category: "os", question: "Scheduler strategy giving fixed time slices to each process?", answer: "round robin" },
  { category: "os", question: "Memory error due to illegal access often called?", answer: "segmentation fault|segfault" },
  { category: "os", question: "Linux command to show process tree?", answer: "pstree" },
  { category: "os", question: "Linux command to search text in files recursively (modern fast tool)?", answer: "rg|ripgrep" },

  { category: "python", question: "Python built-in to iterate with index and value?", answer: "enumerate" },
  { category: "python", question: "Python list method to append element at end?", answer: "append" },
  { category: "python", question: "Output of Python: bool([])", answer: "false" },

  { category: "java", question: "Java keyword used to implement interface?", answer: "implements" },
  { category: "java", question: "Java collection class for key-value mapping?", answer: "hashmap|map" },

  { category: "c", question: "C function to return string length?", answer: "strlen" },
  { category: "c", question: "C header file extension?", answer: ".h|h" },
  { category: "c", question: "C function converting numeric string to integer (basic)?", answer: "atoi" },

  { category: "security", question: "Attack injecting scripts into trusted web pages is called?", answer: "cross site scripting|xss" },
  { category: "security", question: "Hash algorithm widely avoided due to practical collisions?", answer: "md5" },

  { category: "coding", question: "Traversal that visits nodes level by level?", answer: "bfs|breadth first search" },
  { category: "coding", question: "Traversal that goes deep before backtracking?", answer: "dfs|depth first search" },
  { category: "coding", question: "Technique where function calls itself to solve smaller instance?", answer: "recursion" },

  { category: "india-tech", question: "Name of India's central bank digital currency pilot?", answer: "digital rupee|e-rupee" },
  { category: "india-tech", question: "UPI 123PAY primarily targets which phone category?", answer: "feature phones|feature phone" }
];

function answerFormatHint(answer: string): string {
  const variants = answer
    .split("|")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (variants.length > 1) {
    return `type one accepted form, e.g. ${variants.map((v) => `"${v}"`).join(" or ")}`;
  }

  const token = variants[0] ?? "";
  if (/^\d+(\.\d+)?$/.test(token)) return "number only";
  if (token.includes(" ")) return "lowercase phrase";
  if (token.startsWith("git ") || token.includes(".") || token.includes("/") || token.includes("#") || token.includes("-")) {
    return "exact token or command";
  }
  return "single word or token";
}

function curatedQuestionHints(entry: BankEntry): {
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
  quinary: string;
} {
  const q = entry.question.toLowerCase();
  const a = entry.answer.toLowerCase();
  const variants = a.split("|").map((v) => v.trim()).filter(Boolean);
  const variantHint = variants.length > 1 ? `Accepted variants: ${variants.join(" / ")}.` : "Use one exact standard token.";
  const formatHint = `Expected format: ${answerFormatHint(entry.answer)}.`;

  if (q.includes("stands for") || q.includes("abbreviated as") || q.includes("abbreviation")) {
    return {
      primary: "Node hint: expand or identify the official acronym correctly.",
      secondary: "Use the standard textbook/government expansion or short form.",
      tertiary: "Do not add explanation text.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (/\b(19|20)\d{2}\b/.test(q) || q.includes("as of")) {
    return {
      primary: "Node hint: question is time-anchored; answer from the stated period.",
      secondary: "Use the named program/mission from that specific context.",
      tertiary: "Return only the program/mission name token.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (q.includes("status code") || q.includes("how many") || /^\d+/.test(variants[0] ?? "")) {
    return {
      primary: "Node hint: numeric response required.",
      secondary: "Use digits only; no words.",
      tertiary: "No units or extra punctuation.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (q.includes("true or false") || q.includes("yes/no") || q.includes("yes or no")) {
    return {
      primary: "Node hint: boolean token expected.",
      secondary: "Submit exactly one token: true/false or yes/no as asked.",
      tertiary: "No explanation after the token.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (q.includes("without < >")) {
    return {
      primary: "Node hint: submit tag/token only.",
      secondary: "Do not include angle brackets.",
      tertiary: "No sentence text.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (q.startsWith("evaluate") || q.includes("output of") || q.includes("value of")) {
    return {
      primary: "Node hint: compute the exact final output.",
      secondary: "Submit only final value/token.",
      tertiary: "No intermediate steps.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (variants[0]?.startsWith("git ")) {
    return {
      primary: "Node hint: full git command expected.",
      secondary: "Include required subcommand and flags.",
      tertiary: "Spacing must match valid command syntax.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (entry.category === "sql") {
    return {
      primary: "Node hint: SQL keyword/concept expected.",
      secondary: "Use canonical SQL term only.",
      tertiary: "No sentence explanation.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (entry.category === "network") {
    return {
      primary: "Node hint: networking protocol/port/layer token expected.",
      secondary: "Use exact standard networking term.",
      tertiary: "Keep answer minimal and precise.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (entry.category === "india-tech") {
    return {
      primary: "Node hint: think of official Indian digital/public-tech platforms or missions.",
      secondary: "Use the recognized short name or formal mission/platform name.",
      tertiary: "Avoid generic descriptions.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }
  if (["python", "java", "c", "js", "html", "css"].includes(entry.category)) {
    return {
      primary: "Node hint: language token/keyword/API expected.",
      secondary: "Exact spelling and symbols matter.",
      tertiary: "Submit only the token/keyword.",
      quaternary: formatHint,
      quinary: variantHint
    };
  }

  return {
    primary: `Node hint: target concept is in ${entry.category}.`,
    secondary: "Return the shortest exact technical term matching the concept.",
    tertiary: "Avoid descriptive sentences.",
    quaternary: formatHint,
    quinary: variantHint
  };
}

function push(rows: QuestionSeed[], eventId: string, difficulty: number, entry: BankEntry, serial: number): void {
  const cycle = Math.floor(serial / 100) + 1;
  const withSet = cycle === 1 ? entry.question : `${entry.question} (Set ${cycle})`;
  const questionText = `NULL NODE CHALLENGE: ${withSet} [Answer format: ${answerFormatHint(entry.answer)}]`;
  const hints = curatedQuestionHints(entry);
  rows.push({
    event_config_id: eventId,
    difficulty_level: difficulty,
    category: entry.category,
    question_text: questionText,
    correct_answer: entry.answer.trim().toLowerCase(),
    hint_primary: hints.primary,
    hint_secondary: hints.secondary,
    hint_tertiary: hints.tertiary,
    hint_quaternary: hints.quaternary,
    hint_quinary: hints.quinary,
    active: true
  });
}

function fill(rows: QuestionSeed[], eventId: string, difficulty: number, count: number, bank: BankEntry[]): void {
  for (let i = 0; i < count; i += 1) {
    const entry = bank[i % bank.length];
    push(rows, eventId, difficulty, entry, i);
  }
}

export function buildBeginnerQuestionBank(eventId: string, requestedCount: number): QuestionSeed[] {
  const total = Math.max(1000, requestedCount);
  const rows: QuestionSeed[] = [];

  const d1Count = Math.floor(total * 0.22);
  const d2Count = Math.floor(total * 0.22);
  const d3Count = Math.floor(total * 0.2);
  const d4Count = Math.floor(total * 0.18);
  const d5Count = total - d1Count - d2Count - d3Count - d4Count;

  fill(rows, eventId, 1, d1Count, d1Bank);
  fill(rows, eventId, 2, d2Count, d2Bank);
  fill(rows, eventId, 3, d3Count, d3Bank);
  fill(rows, eventId, 4, d4Count, d4Bank);
  fill(rows, eventId, 5, d5Count, d5Bank);

  return rows.slice(0, total);
}
