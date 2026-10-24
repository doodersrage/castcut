module.exports = {
  apps: [
    {
      name: 'comfyui-prompt-studio',
      script: 'npm',
      args: 'run start',
      // Asset downloads keep job state in-process memory — cluster mode loses
      // progress across workers and fights over port 3000. Use a single fork.
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        // package.json `start` also pins -p 47832; keep these aligned.
        PORT: 47832,
        HOSTNAME: '0.0.0.0',
        // Model downloads go to the models folder of the ComfyUI running on this machine (found
        // automatically). To pick one yourself, set COMFYUI_ROOT in .env.local (the folder that
        // holds models/, writable by this process) or choose it in Settings → ComfyUI.
      },
    },
  ],
};
