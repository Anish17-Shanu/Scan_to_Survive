type QuestionSeed = {
  event_config_id: string;
  difficulty_level: number;
  category: string;
  question_text: string;
  correct_answer: string;
  hint_primary: string;
  hint_secondary: string;
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
  { category: "fundamentals", question: "GPU stands for?", answer: "graphics processing unit" },
  { category: "fundamentals", question: "ROM stands for?", answer: "read only memory" },
  { category: "fundamentals", question: "OS stands for?", answer: "operating system" },
  { category: "fundamentals", question: "Binary number system uses which two digits?", answer: "0 and 1" },
  { category: "fundamentals", question: "1 kilobyte equals how many bytes (binary convention)?", answer: "1024" },
  { category: "fundamentals", question: "Main brain of a computer is called?", answer: "cpu" },
  { category: "web", question: "Standard language for structuring web pages?", answer: "html" },
  { category: "web", question: "Language used to style web pages?", answer: "css" },
  { category: "web", question: "Language commonly used for browser scripting?", answer: "javascript" },
  { category: "web", question: "HTML tag for the largest heading (without < >)?", answer: "h1" },
  { category: "web", question: "HTML tag used for a hyperlink (without < >)?", answer: "a" },
  { category: "web", question: "HTML tag used to display an image (without < >)?", answer: "img" },
  { category: "web", question: "CSS property used to change text color?", answer: "color" },
  { category: "web", question: "CSS property for inner spacing?", answer: "padding" },
  { category: "web", question: "CSS property for outer spacing?", answer: "margin" },
  { category: "network", question: "Protocol used for secure websites?", answer: "https" },
  { category: "network", question: "DNS expands to?", answer: "domain name system" },
  { category: "network", question: "Unique address of a device on a network is called?", answer: "ip address" },
  { category: "network", question: "Device that forwards packets between networks?", answer: "router" },
  { category: "network", question: "Common protocol for sending emails from client to server?", answer: "smtp" },
  { category: "database", question: "SQL stands for?", answer: "structured query language" },
  { category: "database", question: "SQL command to read data from a table?", answer: "select" },
  { category: "database", question: "SQL command to add a new row?", answer: "insert" },
  { category: "database", question: "SQL clause used to filter rows?", answer: "where" },
  { category: "database", question: "Database type with fixed tables and relations?", answer: "relational" },
  { category: "database", question: "Popular open-source relational database that uses SQL and starts with M?", answer: "mysql" },
  { category: "database", question: "Popular document-oriented NoSQL database?", answer: "mongodb" },
  { category: "git", question: "Version control system widely used in software teams?", answer: "git" },
  { category: "git", question: "Git command to check working tree status?", answer: "git status" },
  { category: "git", question: "Git command to stage all changed files in current folder?", answer: "git add ." },
  { category: "git", question: "Git command to create a commit?", answer: "git commit" },
  { category: "os", question: "Operating system family developed by Microsoft?", answer: "windows" },
  { category: "os", question: "Operating system family developed by Apple for Mac computers?", answer: "macos" },
  { category: "os", question: "Open-source kernel used by many server distributions?", answer: "linux" },
  { category: "security", question: "Practice of proving identity before access is granted?", answer: "authentication" },
  { category: "security", question: "Practice of deciding what an authenticated user can do?", answer: "authorization" },
  { category: "cloud", question: "On-demand computing resources delivered over the internet are called?", answer: "cloud computing" }
  ,
  { category: "coding", question: "In programming, a set of instructions that performs a task is called?", answer: "function" },
  { category: "coding", question: "Data type used for true/false values?", answer: "boolean" },
  { category: "python", question: "Python keyword used to define a function?", answer: "def" },
  { category: "java", question: "Java keyword to define a class?", answer: "class" },
  { category: "c", question: "Header file commonly used for printf in C?", answer: "stdio.h" },
  { category: "coding", question: "Symbol used for single-line comments in Python?", answer: "#" },
  { category: "coding", question: "Symbol used for single-line comments in Java/C/C++?", answer: "//" },
  { category: "coding", question: "Operator used to assign value to a variable in most languages?", answer: "=" }
];

const d2Bank: BankEntry[] = [
  { category: "web", question: "HTTP status code for successful request?", answer: "200" },
  { category: "web", question: "HTTP status code for resource not found?", answer: "404" },
  { category: "web", question: "HTTP status code for unauthorized request?", answer: "401" },
  { category: "web", question: "HTTP method typically used to create a resource?", answer: "post" },
  { category: "web", question: "HTTP method used to fetch resource data?", answer: "get" },
  { category: "web", question: "Data format commonly used by REST APIs?", answer: "json" },
  { category: "web", question: "JavaScript method to parse JSON text to object?", answer: "json.parse" },
  { category: "web", question: "JavaScript method to convert object to JSON string?", answer: "json.stringify" },
  { category: "web", question: "Browser storage that persists until manually cleared?", answer: "localstorage" },
  { category: "web", question: "Browser storage cleared when tab or browser session ends?", answer: "sessionstorage" },
  { category: "web", question: "CSS layout model for one-dimensional layouts?", answer: "flexbox" },
  { category: "web", question: "CSS layout model for two-dimensional rows and columns?", answer: "grid" },
  { category: "web", question: "In CSS, selector to target element with id main?", answer: "#main" },
  { category: "web", question: "In CSS, selector to target class card?", answer: ".card" },
  { category: "database", question: "SQL command used to modify existing rows?", answer: "update" },
  { category: "database", question: "SQL command used to remove rows?", answer: "delete" },
  { category: "database", question: "SQL keyword used to sort results?", answer: "order by" },
  { category: "database", question: "SQL aggregate function to count rows?", answer: "count" },
  { category: "database", question: "SQL JOIN that returns matching rows from both tables?", answer: "inner join" },
  { category: "database", question: "Constraint that prevents duplicate values in a column?", answer: "unique" },
  { category: "database", question: "Column type designed for date and time in SQL?", answer: "timestamp" },
  { category: "network", question: "Port number used by HTTPS by default?", answer: "443" },
  { category: "network", question: "Port number used by HTTP by default?", answer: "80" },
  { category: "network", question: "Protocol used for secure remote shell access?", answer: "ssh" },
  { category: "network", question: "Protocol for automatic IP assignment in local networks?", answer: "dhcp" },
  { category: "network", question: "Command to test reachability by sending echo requests?", answer: "ping" },
  { category: "git", question: "Git command to download remote changes and merge?", answer: "git pull" },
  { category: "git", question: "Git command to upload local commits to remote?", answer: "git push" },
  { category: "git", question: "Git command to create and switch to a new branch named feature-x?", answer: "git checkout -b feature-x" },
  { category: "git", question: "Git command to view commit history?", answer: "git log" },
  { category: "os", question: "Linux command to list files in current directory?", answer: "ls" },
  { category: "os", question: "Linux command to print current directory path?", answer: "pwd" },
  { category: "os", question: "Linux command to create a new directory?", answer: "mkdir" },
  { category: "os", question: "Linux command to remove a file?", answer: "rm" },
  { category: "security", question: "Technique of converting plaintext to unreadable form using key?", answer: "encryption" },
  { category: "security", question: "A one-way transformation used to verify integrity?", answer: "hashing" },
  { category: "cloud", question: "Cloud model where provider manages runtime but not app code?", answer: "iaas" },
  { category: "cloud", question: "Cloud model where provider manages runtime and platform for your code?", answer: "paas" },
  { category: "cloud", question: "Cloud model where users consume complete application over internet?", answer: "saas" },
  { category: "python", question: "Python built-in to get length of list/string?", answer: "len" },
  { category: "python", question: "Python keyword to iterate over items?", answer: "for" },
  { category: "java", question: "Java keyword used for inheritance?", answer: "extends" },
  { category: "java", question: "Java access modifier for widest visibility?", answer: "public" },
  { category: "c", question: "In C, format specifier for integer in printf?", answer: "%d" },
  { category: "c", question: "In C, function used to read formatted input from stdin?", answer: "scanf" },
  { category: "coding", question: "Common loop keyword used in Java, C, and JavaScript?", answer: "while" },
  { category: "coding", question: "Keyword used to exit a loop immediately?", answer: "break" },
  { category: "coding", question: "Keyword used to skip to next loop iteration?", answer: "continue" },
  { category: "coding", question: "OOP principle of wrapping data and methods together?", answer: "encapsulation" }
];

const d3Bank: BankEntry[] = [
  { category: "js", question: "In JavaScript, value returned by typeof null?", answer: "object" },
  { category: "js", question: "JavaScript array method that adds item to end?", answer: "push" },
  { category: "js", question: "JavaScript array method that removes and returns last item?", answer: "pop" },
  { category: "js", question: "JavaScript keyword to declare block-scoped variable?", answer: "let" },
  { category: "js", question: "JavaScript keyword for immutable binding?", answer: "const" },
  { category: "js", question: "Promise state before resolve or reject?", answer: "pending" },
  { category: "web", question: "Protocol used for full-duplex communication over one TCP connection in web apps?", answer: "websocket" },
  { category: "web", question: "Common architecture style using HTTP methods on resources?", answer: "rest" },
  { category: "web", question: "Header used by browsers to indicate origin URL of request navigation?", answer: "referer" },
  { category: "web", question: "Cross-Origin Resource Sharing is abbreviated as?", answer: "cors" },
  { category: "database", question: "Database property ensuring each transaction is all-or-nothing?", answer: "atomicity" },
  { category: "database", question: "Index generally speeds up which operation: read or write?", answer: "read" },
  { category: "database", question: "Normal form that removes partial dependency on composite keys?", answer: "2nf|second normal form" },
  { category: "database", question: "SQL clause used to filter grouped results?", answer: "having" },
  { category: "database", question: "Primary key can contain NULL values: yes or no?", answer: "no" },
  { category: "network", question: "In the TCP/IP model, IP belongs to which layer?", answer: "internet layer" },
  { category: "network", question: "Protocol used to translate domain names to IP addresses?", answer: "dns" },
  { category: "network", question: "Transport protocol that guarantees ordered delivery?", answer: "tcp" },
  { category: "network", question: "Transport protocol with no delivery guarantee?", answer: "udp" },
  { category: "network", question: "CIDR suffix for subnet mask 255.255.255.0?", answer: "24" },
  { category: "git", question: "Git command to combine another branch history into current branch?", answer: "git merge" },
  { category: "git", question: "Git command to temporarily save uncommitted changes?", answer: "git stash" },
  { category: "git", question: "Git command to show differences between working tree and index?", answer: "git diff" },
  { category: "git", question: "Git area where files stay after add and before commit?", answer: "staging area" },
  { category: "os", question: "Process identifier is commonly abbreviated as?", answer: "pid" },
  { category: "os", question: "Scheduling strategy where each process gets fixed time slice?", answer: "round robin" },
  { category: "os", question: "Memory issue when process accesses memory without permission?", answer: "segmentation fault" },
  { category: "security", question: "Attack that tricks users into revealing credentials through fake pages?", answer: "phishing" },
  { category: "security", question: "Security principle granting minimum required permissions?", answer: "least privilege" },
  { category: "security", question: "Token format commonly used for stateless API auth with three dot-separated parts?", answer: "jwt" },
  { category: "dsa", question: "Time complexity of binary search on sorted array?", answer: "o(log n)" },
  { category: "dsa", question: "Time complexity of linear search in worst case?", answer: "o(n)" },
  { category: "dsa", question: "Data structure that follows FIFO order?", answer: "queue" },
  { category: "dsa", question: "Data structure that follows LIFO order?", answer: "stack" },
  { category: "cloud", question: "Container orchestration platform by CNCF and Google origin?", answer: "kubernetes" },
  { category: "cloud", question: "Artifact that describes container image build steps?", answer: "dockerfile" },
  { category: "python", question: "Output of Python: type([]).__name__", answer: "list" },
  { category: "python", question: "Python data type for key-value pairs?", answer: "dict|dictionary" },
  { category: "python", question: "Python keyword used for exception handling block start?", answer: "try" },
  { category: "java", question: "JVM stands for?", answer: "java virtual machine" },
  { category: "java", question: "Java collection that does not allow duplicate elements?", answer: "set" },
  { category: "java", question: "Keyword used to create object instance in Java?", answer: "new" },
  { category: "c", question: "In C, operator used to access value via pointer?", answer: "*" },
  { category: "c", question: "In C, keyword used to declare a constant variable?", answer: "const" },
  { category: "c", question: "In C, memory allocated with malloc should be released using?", answer: "free" },
  { category: "coding", question: "Algorithmic approach where a problem is solved by solving smaller subproblems?", answer: "dynamic programming" }
];

const d4Bank: BankEntry[] = [
  { category: "logic", question: "Evaluate: 3 + 4 * 2", answer: "11" },
  { category: "logic", question: "Evaluate: (10 - 4) * 3", answer: "18" },
  { category: "logic", question: "Evaluate in JavaScript: 5 === '5' (true/false)", answer: "false" },
  { category: "logic", question: "Evaluate in JavaScript: 5 == '5' (true/false)", answer: "true" },
  { category: "logic", question: "If n=7 and n%=3, final n?", answer: "1" },
  { category: "logic", question: "If arr=[10,20,30,40], value of arr[2]?", answer: "30" },
  { category: "logic", question: "For loop i from 1 to 4, sum of i values?", answer: "10" },
  { category: "logic", question: "Highest valid index in array of length 9?", answer: "8" },
  { category: "web", question: "HTTP status code for conflict?", answer: "409" },
  { category: "web", question: "HTTP status code for internal server error?", answer: "500" },
  { category: "web", question: "Header commonly used to send bearer token?", answer: "authorization" },
  { category: "web", question: "Value prefix before token in bearer auth header?", answer: "bearer" },
  { category: "web", question: "Frontend library created by Meta for UI components?", answer: "react" },
  { category: "web", question: "Node.js framework often used for REST APIs that starts with E?", answer: "express" },
  { category: "database", question: "SQL query to count all rows: SELECT ___(*) FROM table_name", answer: "count" },
  { category: "database", question: "SQL keyword to remove duplicate rows from result set?", answer: "distinct" },
  { category: "database", question: "Join that returns all rows from left table and matching rows from right?", answer: "left join" },
  { category: "database", question: "Transaction command that permanently applies changes?", answer: "commit" },
  { category: "database", question: "Transaction command that undoes uncommitted changes?", answer: "rollback" },
  { category: "network", question: "Common private IPv4 range starting with 192.168 is classed as public or private?", answer: "private" },
  { category: "network", question: "Loopback IPv4 address?", answer: "127.0.0.1" },
  { category: "network", question: "Tool used to view route packets take across networks?", answer: "traceroute" },
  { category: "network", question: "OSI layer responsible for end-to-end delivery and segmentation?", answer: "transport layer" },
  { category: "git", question: "Command to see branches in git?", answer: "git branch" },
  { category: "git", question: "Command to clone a remote repository?", answer: "git clone" },
  { category: "git", question: "Command to fetch remote changes without merge?", answer: "git fetch" },
  { category: "git", question: "Command to restore file from last commit in modern git?", answer: "git restore" },
  { category: "os", question: "Linux command to change directory?", answer: "cd" },
  { category: "os", question: "Linux command to print file contents?", answer: "cat" },
  { category: "os", question: "Linux command to show running processes (traditional command)?", answer: "ps" },
  { category: "security", question: "Security test that simulates real attacker behavior is called?", answer: "penetration testing" },
  { category: "security", question: "Secret used with one-time code apps in MFA is called?", answer: "shared secret" },
  { category: "ai", question: "Field focused on training models from data is called?", answer: "machine learning" },
  { category: "ai", question: "Neural network type commonly used for images (abbrev)?", answer: "cnn" },
  { category: "ai", question: "Metric that measures correct positives among predicted positives?", answer: "precision" },
  { category: "ai", question: "Metric that measures correct positives among actual positives?", answer: "recall" },
  { category: "python", question: "Output of Python: 3 // 2", answer: "1" },
  { category: "python", question: "Output of Python: 'A' * 3", answer: "aaa" },
  { category: "python", question: "Python keyword used to define anonymous function?", answer: "lambda" },
  { category: "java", question: "In Java, method entry point is named?", answer: "main" },
  { category: "java", question: "Java primitive type for 64-bit integer?", answer: "long" },
  { category: "java", question: "In Java, keyword used to prevent method overriding?", answer: "final" },
  { category: "c", question: "In C, array index starts from?", answer: "0" },
  { category: "c", question: "In C, operator used to get address of variable?", answer: "&" },
  { category: "c", question: "In C, keyword for conditional branch alternative to if?", answer: "else" },
  { category: "coding", question: "Big-O of accessing element by index in array/list?", answer: "o(1)" }
];

const d5Bank: BankEntry[] = [
  { category: "js", question: "Output of JavaScript expression: Math.floor(7.9)", answer: "7" },
  { category: "js", question: "Output of JavaScript: [1,2,3].length", answer: "3" },
  { category: "js", question: "Output of JavaScript: 'Tech'.toLowerCase()", answer: "tech" },
  { category: "js", question: "Output of JavaScript: Number('42') + 8", answer: "50" },
  { category: "js", question: "Value of 2 ** 5 in JavaScript", answer: "32" },
  { category: "dsa", question: "Worst-case time complexity of quicksort?", answer: "o(n^2)" },
  { category: "dsa", question: "Average time complexity of quicksort?", answer: "o(n log n)" },
  { category: "dsa", question: "Time complexity of hash table average lookup?", answer: "o(1)" },
  { category: "dsa", question: "Data structure typically used for BFS traversal?", answer: "queue" },
  { category: "dsa", question: "Data structure typically used for DFS traversal?", answer: "stack" },
  { category: "database", question: "SQL clause order: SELECT ... FROM ... WHERE ... ___ ...", answer: "group by" },
  { category: "database", question: "SQL function to get maximum value in a column?", answer: "max" },
  { category: "database", question: "SQL function to get minimum value in a column?", answer: "min" },
  { category: "database", question: "Normal form that removes transitive dependencies?", answer: "3nf|third normal form" },
  { category: "database", question: "Property ensuring committed transactions survive power loss?", answer: "durability" },
  { category: "network", question: "Protocol used to securely transfer files over SSH?", answer: "sftp" },
  { category: "network", question: "Name resolution failure is usually related to which service?", answer: "dns" },
  { category: "network", question: "TLS primarily provides encryption at which OSI layer context for web traffic?", answer: "application layer" },
  { category: "network", question: "If subnet mask is /30, how many total IPv4 addresses are in that subnet?", answer: "4" },
  { category: "network", question: "If subnet mask is /24, how many total IPv4 addresses are in that subnet?", answer: "256" },
  { category: "git", question: "Command to move HEAD to previous commit without deleting changes in working tree (mixed reset)?", answer: "git reset HEAD~1" },
  { category: "git", question: "Command to show one-line commit history graph style?", answer: "git log --oneline" },
  { category: "git", question: "Git command to apply commits from another branch onto current branch one by one?", answer: "git rebase" },
  { category: "git", question: "Git command to show who changed each line in file?", answer: "git blame" },
  { category: "security", question: "Type of vulnerability where untrusted input alters SQL query meaning?", answer: "sql injection|sqli" },
  { category: "security", question: "Type of attack where script is injected into trusted web page?", answer: "cross site scripting|xss" },
  { category: "security", question: "Security acronym for Confidentiality, Integrity, Availability?", answer: "cia triad" },
  { category: "security", question: "Hashing algorithm currently considered insecure due to collisions and often avoided?", answer: "md5" },
  { category: "cloud", question: "AWS object storage service name?", answer: "s3" },
  { category: "cloud", question: "Google Cloud managed Kubernetes service abbreviation?", answer: "gke" },
  { category: "cloud", question: "Azure managed Kubernetes service abbreviation?", answer: "aks" },
  { category: "cloud", question: "Practice of shipping code changes automatically after passing tests?", answer: "continuous deployment" },
  { category: "cloud", question: "Practice of frequently merging small code changes to main branch?", answer: "continuous integration" },
  { category: "ai", question: "Model output quality generally evaluated on unseen data called?", answer: "test set" },
  { category: "ai", question: "Problem where model learns training data too well and performs poorly on new data?", answer: "overfitting" },
  { category: "ai", question: "Technique to reduce overfitting by dropping neurons during training?", answer: "dropout" },
  { category: "python", question: "Output of Python: bool([])", answer: "false" },
  { category: "python", question: "Python built-in to iterate with index and value?", answer: "enumerate" },
  { category: "python", question: "Python method to add item at end of list?", answer: "append" },
  { category: "java", question: "Java keyword used to implement an interface?", answer: "implements" },
  { category: "java", question: "Java exception type at top of throwable hierarchy branch for recoverable conditions?", answer: "exception" },
  { category: "java", question: "Java collection class for key-value mapping?", answer: "hashmap|map" },
  { category: "c", question: "In C, standard function to compute string length?", answer: "strlen" },
  { category: "c", question: "In C, file extension typically used for header files?", answer: ".h|h" },
  { category: "c", question: "In C, function that returns integer from string conversion?", answer: "atoi" },
  { category: "coding", question: "Traversal type that goes level by level in a tree?", answer: "bfs|breadth first search" },
  { category: "coding", question: "Traversal type that goes deep before backtracking in a tree/graph?", answer: "dfs|depth first search" },
  { category: "coding", question: "Technique where function calls itself to solve smaller instance?", answer: "recursion" }
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
  if (token.startsWith("git ") || token.includes(".") || token.includes("/") || token.includes("#")) {
    return "exact token or command";
  }
  return "single word or token";
}

function answerFingerprint(answer: string): string {
  const variants = answer
    .split("|")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const summarize = (token: string) => {
    const words = token.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const initials = words.map((w) => w[0]).join("");
      return `${words.length} words, initials "${initials}", total chars ${token.length}`;
    }
    return `starts with "${token[0] ?? ""}", length ${token.length}`;
  };
  if (variants.length <= 1) return summarize(variants[0] ?? "");
  return variants.slice(0, 2).map((v, i) => `v${i + 1}: ${summarize(v)}`).join(" | ");
}

function curatedQuestionHints(entry: BankEntry): { primary: string; secondary: string } {
  const q = entry.question.toLowerCase();
  const a = entry.answer.toLowerCase();
  const primaryAnswer = a.split("|")[0]?.trim() ?? a.trim();
  const fingerprint = answerFingerprint(entry.answer);

  if (q.includes("stands for")) {
    return {
      primary: `Expand the acronym completely. Answer fingerprint: ${fingerprint}.`,
      secondary: "Write the full phrase in lowercase words, not short form."
    };
  }
  if (q.includes("status code") || q.includes("how many") || /^\d+/.test(primaryAnswer)) {
    return {
      primary: `Numeric response required. Answer fingerprint: ${fingerprint}.`,
      secondary: "Use digits only; no words, no symbols unless explicitly asked."
    };
  }
  if (q.includes("true/false") || q.includes("yes or no")) {
    return {
      primary: `Boolean-style single token expected. Answer fingerprint: ${fingerprint}.`,
      secondary: "Use exactly one word: true/false or yes/no as requested."
    };
  }
  if (q.includes("without < >")) {
    return {
      primary: `HTML/token only expected. Answer fingerprint: ${fingerprint}.`,
      secondary: "Do not include angle brackets, quotes, or explanation."
    };
  }
  if (q.includes("output of") || q.startsWith("evaluate")) {
    return {
      primary: `Evaluate exactly; result shape is fixed. Answer fingerprint: ${fingerprint}.`,
      secondary: "Return only the computed final value/token."
    };
  }
  if (primaryAnswer.startsWith("git ")) {
    return {
      primary: `Full git command expected. Answer fingerprint: ${fingerprint}.`,
      secondary: "Include git subcommand and required flags/args."
    };
  }
  if (primaryAnswer.includes("|")) {
    return {
      primary: `Multiple accepted variants exist. Fingerprint: ${fingerprint}.`,
      secondary: "Any one standard variant is valid."
    };
  }
  if (entry.category === "database" && q.includes("normal form")) {
    return {
      primary: `Normalization term expected. Answer fingerprint: ${fingerprint}.`,
      secondary: "Short form (e.g., 2NF/3NF) or full name is accepted."
    };
  }
  if (entry.category === "network" && (q.includes("protocol") || q.includes("port"))) {
    return {
      primary: `Networking token expected. Answer fingerprint: ${fingerprint}.`,
      secondary: "Use exact protocol/port token, lowercase unless numeric."
    };
  }
  if (entry.category === "security") {
    return {
      primary: `Canonical security term expected. Answer fingerprint: ${fingerprint}.`,
      secondary: "Use the standard term, not a long explanation sentence."
    };
  }
  if (entry.category === "python" || entry.category === "java" || entry.category === "c" || entry.category === "js") {
    return {
      primary: `Language token/keyword/API expected. Answer fingerprint: ${fingerprint}.`,
      secondary: "Exact spelling and symbols matter."
    };
  }
  return {
    primary: `Target concept is in ${entry.category}. Answer fingerprint: ${fingerprint}.`,
    secondary: "Return the shortest exact technical term matching the concept."
  };
}

function push(rows: QuestionSeed[], eventId: string, difficulty: number, entry: BankEntry, serial: number): void {
  const cycle = Math.floor(serial / 100) + 1;
  const withSet = cycle === 1 ? entry.question : `${entry.question} (Set ${cycle})`;
  const questionText = `${withSet} [Answer format: ${answerFormatHint(entry.answer)}]`;
  const hints = curatedQuestionHints(entry);
  rows.push({
    event_config_id: eventId,
    difficulty_level: difficulty,
    category: entry.category,
    question_text: questionText,
    correct_answer: entry.answer.trim().toLowerCase(),
    hint_primary: hints.primary,
    hint_secondary: hints.secondary,
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
