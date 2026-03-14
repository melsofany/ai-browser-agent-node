/**
 * Data Generator Utility
 * Generates semi-realistic data for form filling
 */

class DataGenerator {
  constructor() {
    this.firstNames = ['Ahmed', 'Mohamed', 'Sarah', 'Fatima', 'Omar', 'Laila', 'Zaid', 'Nour', 'Youssef', 'Mariam', 'Khaled', 'Huda', 'Ali', 'Reem', 'Mustafa'];
    this.lastNames = ['Mansour', 'Hassan', 'Zaid', 'Al-Fahad', 'Salem', 'Ibrahim', 'Khalil', 'Abbas', 'Suleiman', 'Bakir', 'Amer', 'Nasser', 'Ghanem', 'Khoury', 'Haddad'];
    this.domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'];
  }

  generateName() {
    const first = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    const last = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
    return `${first} ${last}`;
  }

  generateSurname() {
    return this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
  }

  generateFirstName() {
    return this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
  }

  generateEmail(name) {
    const cleanName = (name || this.generateName()).toLowerCase().replace(/\s+/g, '.');
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    const domain = this.domains[Math.floor(Math.random() * this.domains.length)];
    return `${cleanName}${randomNum}@${domain}`;
  }

  generatePassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password + 'A1!'; // Ensure complexity
  }

  generateBirthDate() {
    const year = Math.floor(Math.random() * (2005 - 1980 + 1)) + 1980;
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  generatePhone() {
    const prefix = ['010', '011', '012', '015'][Math.floor(Math.random() * 4)];
    const num = Math.floor(Math.random() * 90000000) + 10000000;
    return `${prefix}${num}`;
  }

  generateGender() {
    return Math.random() > 0.5 ? 'Male' : 'Female';
  }

  getRealisticValue(fieldType, context = '') {
    const type = fieldType.toLowerCase();
    const ctx = context.toLowerCase();

    if (type.includes('email') || ctx.includes('email')) return this.generateEmail();
    if (type.includes('password') || ctx.includes('password')) return this.generatePassword();
    if (type.includes('surname') || ctx.includes('surname') || type.includes('last') || ctx.includes('last')) return this.generateSurname();
    if (type.includes('firstname') || ctx.includes('first') || type.includes('first')) return this.generateFirstName();
    if (type.includes('name') || ctx.includes('name')) return this.generateName();
    if (type.includes('date') || ctx.includes('birth') || ctx.includes('dob')) return this.generateBirthDate();
    if (type.includes('phone') || ctx.includes('phone') || type.includes('tel') || ctx.includes('mobile')) return this.generatePhone();
    if (type.includes('gender') || ctx.includes('gender') || type.includes('sex')) return this.generateGender();
    
    return 'Sample Data';
  }
}

module.exports = new DataGenerator();
