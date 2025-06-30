const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

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

async function sendEmailNotification(params) {
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
      const absoluteStatsPath = path.resolve(process.cwd(), params.statsPath);
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

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      host: params.smtpServer,
      port: parseInt(params.smtpPort),
      secure: params.smtpPort === "465", // true for 465, false for other ports
      requireTLS: params.smtpPort === "587", // require TLS for port 587
      tls: {
        minVersion: "TLSv1.2",
        rejectUnauthorized: false, // Allow self-signed certificates
        ciphers: "SSLv3",
      },
      auth: {
        user: params.smtpUser,
        pass: params.smtpPassword,
      },
    });

    // Verify SMTP connection
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (error) {
      console.error("SMTP connection failed:", error.message);
      throw error;
    }

    // Parse the run ID format: "[123](https://link-url-here.com)"
    const runIdMatch = params.runId.match(/\[(.*?)\]\((.*?)\)/);
    const displayId = runIdMatch ? runIdMatch[1] : params.runId;
    const runUrl = runIdMatch ? runIdMatch[2] : "";

    const EMAIL_TEMPLATE = `<!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; background-color: #f7f9fc; color: #333; padding: 20px; }
              .container { background-color: #ffffff; border-radius: 8px; padding: 20px; max-width: 700px; margin: auto; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
              h2 { color: #0052cc; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { padding: 10px; border: 1px solid #e0e0e0; text-align: left; }
              th { background-color: #f0f4f8; }
              .footer { margin-top: 30px; font-size: 0.9em; color: #777; }
              .button { display: inline-block; background-color: #0052cc; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-top: 10px; }
              .summary { background-color: #f9fafc; padding: 10px; border-left: 4px solid #0052cc; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>✅ API Test Suite Execution Report: ${
                params.frameworkName
              } #${displayId}</h2>
              <p>Hi Team,</p>
              <p>Please find below the results of the latest <strong>API Test Suite Execution</strong>:</p>

              <div class="summary">
                <p>
                  <strong>Project:</strong> ${params.frameworkName}<br />
                  <strong>Environment:</strong> ${params.environment}<br />
                  <strong>Build Number:</strong> <a href="${runUrl}">#${displayId}</a><br />
                  <strong>Test Suite:</strong> ${params.testSuite}<br />
                  <strong>Test Report:</strong> <a href="${
                    params.testReportUrl
                  }">View Allure Report #${displayId}</a><br />
                  <!-- NOTE: This section is temporarily disabled and uncomment to include the pipeline URL
                  <strong>Pipeline URL:</strong> <a href="${runUrl}">${runUrl}</a><br />
                  -->
                  <strong>Execution Date:</strong> ${new Date().toLocaleString()}<br />
                  <strong>Executed By:</strong> ${
                    params.executedBy || "Automation System"
                  }
                </p>
              </div>

              <h3>📊 Execution Summary</h3>
              <table>
                <tr>
                  <th>Metric</th>
                  <th>Count</th>
                </tr>
                <tr>
                  <td>Total Test Scripts</td>
                  <td>${stats.total}</td>
                </tr>
                <tr>
                  <td>Passed</td>
                  <td>${stats.passed}</td>
                </tr>
                <tr>
                  <td>Failed</td>
                  <td>${stats.failed}</td>
                </tr>
                <tr>
                  <td>Broken</td>
                  <td>${stats.broken}</td>
                </tr>
                <tr>
                  <td>Skipped</td>
                  <td>${stats.skipped}</td>
                </tr>
                <tr>
                  <td>Unknown Status</td>
                  <td>${stats.unknown}</td>
                </tr>
                <tr>
                  <td>Retried Tests</td>
                  <td>${stats.retries}</td>
                </tr>
              </table>

              <p>If you have any questions or feedback, feel free to reach out to the <strong>Testing Team</strong>.</p>

              <div class="footer">
                Best Regards,<br />
                <strong>${params.senderName || "Testing Team"}</strong><br />
                <a href="mailto:${params.senderEmail}">${
      params.senderEmail
    }</a><br />
              </div>
            </div>
          </body>
        </html>`;

    // Prepare attachments if specified
    const attachments = [];
    if (params.resultsAttachment && fs.existsSync(params.resultsAttachment)) {
      attachments.push({
        filename: path.basename(params.resultsAttachment),
        path: params.resultsAttachment,
      });
    }

    // Send email
    await transporter.sendMail({
      from: params.smtpUser,
      to: params.receiverEmail
        .split(",")
        .map((email) => email.trim())
        .join(", "),
      subject: ` API Test Suite Execution Report - ${params.frameworkName} #${displayId}`,
      html: EMAIL_TEMPLATE,
      attachments: attachments,
    });

    console.log("Email notification sent successfully");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const params = {};

const paramOrder = [
  ["--smtp-server", "smtpServer"],
  ["--smtp-user", "smtpUser"],
  ["--smtp-password", "smtpPassword"],
  ["--smtp-port", "smtpPort"],
  ["--sender-name", "senderName"],
  ["--sender-email", "senderEmail"],
  ["--receiver-email", "receiverEmail"],
  ["--executed-by", "executedBy"],
  ["--test-framework-name", "frameworkName"],
  ["--test-environment", "environment"],
  ["--test-suite", "testSuite"],
  ["--test-run-id", "runId"],
  ["--test-report-url", "testReportUrl"],
  ["--test-results", "statsPath"],
  ["--test-results-attachment", "resultsAttachment"],
];

paramOrder.forEach(([arg, param]) => {
  const index = args.indexOf(arg);
  if (index !== -1 && args[index + 1]) {
    params[param] = args[index + 1];
  }
});

// Validate required parameters (excluding optional ones)
const requiredParams = [
  "smtpServer",
  "smtpUser",
  "smtpPassword",
  "smtpPort",
  "senderName",
  "senderEmail",
  "receiverEmail",
  "executedBy",
  "frameworkName",
  "runId",
  "statsPath",
  "environment",
];

const missingParams = requiredParams.filter((param) => !params[param]);
if (missingParams.length > 0) {
  console.error("Missing required parameters:", missingParams.join(", "));
  console.error(`
Usage: node emailNotifier.js
Required:
  --smtp-server <server>                 SMTP server hostname
  --smtp-user <user>                     SMTP username/email
  --smtp-password <password>             SMTP password
  --smtp-port <port>                     SMTP port (e.g. 587, 465)
  --sender-name <name>                   Name of the sender
  --sender-email <email>                 Email address of sender
  --receiver-email <email>               Email address(es) of recipient(s)
  --executed-by <name>                   Name of test executor
  --test-framework-name <name>           Name of the test framework
  --test-environment <env>               Test environment name
  --test-run-id <id>                     Test run identifier
  --test-results <path>                  Path to test statistics file

Optional:
  --test-suite <suite>                   Test suite name
  --test-report-url <url>                URL to test report
  --test-results-attachment <file>       Path to results attachment file
`);
  process.exit(1);
}

sendEmailNotification(params);
