const { execSync } = require('child_process');
const config = require('../config/config');

/**
 * Script to push changes to GitHub using environment variables
 */
async function pushToGitHub() {
  const token = config.githubToken;
  // We'll try to get the repo URL from environment or git config
  let repoUrl = process.env.GITHUB_REPO_URL;

  if (!token) {
    console.error('Error: GITHUB_TOKEN is missing. Please add it to AI Studio Secrets.');
    process.exit(1);
  }
  if (!repoUrl) {
    console.error('Error: GITHUB_REPO_URL is missing. Please add it to AI Studio Secrets.');
    process.exit(1);
  }

  try {
    console.log('Initializing git if needed...');
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    } catch (e) {
      execSync('git init');
    }

    // Configure user if not set
    console.log('Configuring git user...');
    execSync('git config user.email "agent@aistudio.build"');
    execSync('git config user.name "AI Studio Agent"');

    // Add all changes
    console.log('Adding changes...');
    execSync('git add .');

    // Commit changes
    console.log('Committing changes...');
    const commitMessage = `Update: Improvements to BrowserAgent and Loop Detection - ${new Date().toISOString()}`;
    try {
      execSync(`git commit -m "${commitMessage}"`);
    } catch (e) {
      console.log('No changes to commit.');
    }

    // Get remote URL if not provided
    if (!repoUrl) {
      try {
        repoUrl = execSync('git remote get-url origin').toString().trim();
      } catch (e) {
        console.error('Error: Remote "origin" not found and GITHUB_REPO_URL not provided.');
        process.exit(1);
      }
    }

    // Prepare URL with token for authentication
    // Format: https://<token>@github.com/username/repo.git
    let authRepoUrl = repoUrl;
    if (repoUrl.includes('github.com')) {
      const urlParts = repoUrl.split('github.com/');
      if (urlParts.length === 2) {
        authRepoUrl = `https://${token}@github.com/${urlParts[1]}`;
      }
    }

    console.log('Pushing to GitHub...');
    // Force push to ensure updates go through in this environment
    execSync(`git push "${authRepoUrl}" main --force`, { stdio: 'inherit' });
    
    console.log('Successfully pushed changes to GitHub!');
  } catch (error) {
    console.error('Failed to push to GitHub:', error.message);
    process.exit(1);
  }
}

pushToGitHub();
