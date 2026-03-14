import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';

async function pushToGithub() {
  const token = process.env.GITHUB_TOKEN;
  const repoUrl = process.env.GITHUB_REPO_URL;

  if (!token || !repoUrl) {
    console.error('❌ خطأ: GITHUB_TOKEN أو GITHUB_REPO_URL غير موجود في الأسرار.');
    process.exit(1);
  }

  // تنظيف الرابط وتجهيز الرابط الموثق
  let cleanUrl = repoUrl.replace(/^https?:\/\//, '').replace(/\.git$/, '');
  const authUrl = `https://${token}@${cleanUrl}.git`;

  try {
    console.log('🔄 تهيئة Git...');
    try {
      execSync('git init');
    } catch (e) {
      console.log('Git موجود بالفعل.');
    }

    console.log('👤 إعداد بيانات المستخدم...');
    execSync('git config user.email "agent@ai-studio.build"');
    execSync('git config user.name "AI Agent"');

    console.log('📂 إضافة الملفات...');
    execSync('git add .');

    console.log('💾 عمل Commit...');
    const commitMsg = "Fix: Resolve ChromaDB auth, Accessibility API crash, and executor scope errors";
    try {
      execSync(`git commit -m "${commitMsg}"`);
    } catch (e) {
      console.log('لا توجد تغييرات جديدة لعمل Commit.');
    }

    console.log('🌐 إعداد المستودع البعيد...');
    try {
      execSync('git remote remove origin');
    } catch (e) {}
    execSync(`git remote add origin https://${token}@${cleanUrl}.git`);

    console.log('🚀 دفع الكود إلى GitHub...');
    // محاولة الدفع لفرع main أو master
    try {
      execSync('git push -u origin main --force');
    } catch (e) {
      console.log('فشل الدفع لـ main، محاولة master...');
      execSync('git push -u origin master --force');
    }

    console.log('✅ تم دفع التغييرات إلى GitHub بنجاح!');
  } catch (error: any) {
    console.error('❌ فشلت العملية:', error.message);
    process.exit(1);
  }
}

pushToGithub();
