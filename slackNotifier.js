const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

function normalizeStats(fileStats) {
  return {
    total: fileStats.total || 0,
    passed: fileStats.passed || 0,
    failed: fileStats.failed || 0,
    broken: fileStats.broken || 0,
    skipped: fileStats.skipped || 0,
    unknown: fileStats.unknown || 0,
    retries: fileStats.retries || 0,
  };
}

async function sendSlackNotification(
  slackBotUserOAuthToken,
  slackChannelId,
  executedBy,
  frameworkName,
  environment,
  testSuite,
  runId,
  testReportUrl,
  statsPath
) {
  try {
    let stats = {
      total: 0,
      passed: 0,
      failed: 0,
      broken: 0,
      skipped: 0,
      unknown: 0,
      retries: 0,
    };

    // Try to read stats file if it exists
    try {
      const absoluteStatsPath = path.resolve(process.cwd(), statsPath);
      if (fs.existsSync(absoluteStatsPath)) {
        const fileStats = JSON.parse(
          fs.readFileSync(absoluteStatsPath, "utf8")
        );
        stats = normalizeStats(fileStats);
      } else {
        console.warn(
          `Warning: Statistics file not found at: ${absoluteStatsPath}. Using default values.`
        );
      }
    } catch (fileError) {
      console.warn(
        "Warning: Error reading statistics file. Using default values."
      );
    }

    // Parse the run ID format: "[123](https://link-url-here.com)"
    const runIdMatch = runId.match(/\[(.*?)\]\((.*?)\)/);
    const displayId = runIdMatch ? runIdMatch[1] : runId;
    const runUrl = runIdMatch ? runIdMatch[2] : "";

    const status = stats.failed > 0 || stats.broken > 0 ? "❌" : "✅";
    const color = stats.failed > 0 || stats.broken > 0 ? "danger" : "good";

    const message = {
      channel: slackChannelId,
      text: `*API Test Execution Complete - ${frameworkName} #<${runUrl}|${displayId}>*`,
      attachments: [
        {
          pretext: `
:globe_with_meridians: *Environment:* ${environment}
:test_tube: *Test Suite:* ${testSuite}
:mega: *Test Report:* <${testReportUrl}| View Allure Report #${displayId}>
:calendar:* Execution Date:* ${new Date().toLocaleString()}
:robot_face: *Executed By:* ${executedBy}


📊 *Execution Summary:*`,
          color: color,
          fields: [
            {
              title: ":clipboard: Total Test Cases",
              value: `${stats.total}`,
              short: true,
            },
            {
              title: ":white_check_mark: Passed Test Cases",
              value: `${stats.passed}`,
              short: true,
            },
            {
              title: ":x: Failed Test Cases",
              value: `${stats.failed}`,
              short: true,
            },
            {
              title: ":warning: Broken Test Cases",
              value: `${stats.broken}`,
              short: true,
            },
            {
              title: ":fast_forward: Skipped Test Cases",
              value: `${stats.skipped}`,
              short: true,
            },
            {
              title: ":grey_question: Unknown Status",
              value: `${stats.unknown}`,
              short: true,
            },
            {
              title: ":repeat: Retried Test Cases",
              value: `${stats.retries}`,
              short: true,
            },
          ],
        },
      ],
    };

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackBotUserOAuthToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Failed to send notification: ${result.error}`);
    }

    console.log("Notification sent successfully");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const params = {};

// Cleaned up argument parsing
let lastFlag = "";
args.forEach((arg) => {
  if (arg.startsWith("--")) {
    lastFlag = arg;
  } else if (lastFlag) {
    switch (lastFlag) {
      case "--slack-channel-id":
        params.slackChannelId = arg;
        break;
      case "--slack-bot-user-oauth-token":
        params.slackBotUserOAuthToken = arg;
        break;
      case "--executed-by":
        params.executedBy = arg;
        break;
      case "--test-framework-name":
        params.frameworkName = arg;
        break;
      case "--test-environment":
        params.environment = arg;
        break;
      case "--test-suite":
        params.testSuite = arg;
        break;
      case "--test-run-id":
        params.runId = arg;
        break;
      case "--test-report-url":
        params.testReportUrl = arg;
        break;
      case "--test-results":
        params.statsPath = arg;
        break;
    }
    lastFlag = "";
  }
});

// Validate required parameters
const requiredParams = {
  slackBotUserOAuthToken: params.slackBotUserOAuthToken,
  slackChannelId: params.slackChannelId,
  frameworkName: params.frameworkName,
  runId: params.runId,
  statsPath: params.statsPath,
};

const missingParams = Object.entries(requiredParams)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingParams.length > 0) {
  console.error(`Missing required parameters: ${missingParams.join(", ")}`);
  console.error(`
Usage: node slackNotifier.js
Required:
  --slack-bot-user-oauth-token <token>   Slack Bot User OAuth Token (xoxb-*)
  --slack-channel-id <channel-id>        Slack Channel ID
  --test-framework-name <name>           Name of the test framework
  --test-run-id <id>                     Test run identifier
  --test-results <path>                  Path to test statistics file

Optional:
  --executed-by <executor>               Name of test executor
  --test-environment <env>               Test environment name
  --test-suite <suite>                   Test suite name
  --test-report-url <url>                URL to test report
`);
  process.exit(1);
}

sendSlackNotification(
  params.slackBotUserOAuthToken,
  params.slackChannelId,
  params.executedBy,
  params.frameworkName,
  params.environment,
  params.testSuite,
  params.runId,
  params.testReportUrl,
  params.statsPath
);
