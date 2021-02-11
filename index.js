require("dotenv").config();
const marked = require("marked");
const { Octokit } = require("@octokit/core");
const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
});
const endpoint = `https://api.github.com/repos/${process.env.GITHUB_ORG || "PolymathNetwork"}/${process.env.GITHUB_ORG || "Polymesh"}/`;
const octokit = new Octokit({ auth: process.env.ACCESS_TOKEN, baseUrl: endpoint });
const parsedChanges = new Map();
const fs = require('fs');

async function main() {
    readline.question(
        "Enter the release PR number: ",
        async (input) => {
            const prNumber = Number(input);
            if (isNaN(prNumber)) {
                console.log("Invalid input");
                process.exit(1);
            }
            const promises = [];
            for (let i = 1; i <= 3; i++) {
                const { data } = await octokit.request(`pulls/${prNumber}/commits`, {
                    per_page: 30,
                    page: i,
                });
                Object.values(data).forEach((commit) => {
                    promises.push(
                        octokit.request(`commits/${commit.sha}/pulls`, { mediaType: { previews: ['groot'] } })
                        .then(({ data }) => {
                            Object.values(data).forEach((pr) => {
                                if (pr.number == prNumber) {
                                    return;
                                }
                                if (JSON.stringify(pr.body).toLocaleLowerCase().includes("changelog")) {
                                    let contents = JSON.stringify(pr.body).split(/##* +/gi);
                                    for (let j = 0; j < contents.length; j++) {
                                        if (contents[j].toLocaleLowerCase().startsWith("changelog")) {
                                            contents = contents.splice(j + 1);
                                            break;
                                        }
                                    }
                                    contents.forEach((content) => {
                                        const changeType = content.substr(0, content.indexOf("\\")).toLocaleLowerCase();
                                        let changes = content.split(/\\n- */gi).splice(1);
                                        changes = changes.map((change) => {
                                            let trimmedChange = change.replace(/\\\\n|\\\\r|\\n|\\r/g, "");
                                            if (trimmedChange.slice(-1) == '"') {
                                                trimmedChange = trimmedChange.slice(0, -1);
                                            }
                                            return trimmedChange.concat(` (${pr.html_url})`);
                                        });
                                        if (parsedChanges.has(changeType)) {
                                            parsedChanges.set(changeType, [...parsedChanges.get(changeType), ...changes]);
                                        } else {
                                            parsedChanges.set(changeType, changes);
                                        }
                                    });
                                }
                            });
                        })
                    )
                });
            }
            await Promise.all(promises);
            let result = "## changelog\n\n";
            for (const [changeType, changes] of parsedChanges.entries()) {
                result = result.concat(`### ${changeType}\n\n`);
                changes.forEach((change) => {
                    result = result.concat(`- ${change}\n`);
                })
                result = result.concat("\n");
            }
            fs.writeFileSync("CHANGELOG.md", result);
            console.log("Changelog stored in CHANGELOG.md");
            process.exit(0);
        }
    );
}

main();
