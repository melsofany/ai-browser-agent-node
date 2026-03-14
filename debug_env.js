console.log("Available Env Vars:", Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('NODE_')));
