#!/bin/bash
# Script para iniciar el bot en background

nohup npm run dev > bot.log 2>&1 &
echo "✅ Bot iniciado en background (PID: $!)"
echo "Para ver los logs: tail -f bot.log"
echo "Para detener: npm run stop o mata el proceso"
