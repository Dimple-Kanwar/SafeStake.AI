
Install Dependencies:

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
npm run install-agents

Shut down any running agent processes:
pkill -f "coordinator.py"
pkill -f "strategy_optimizer.py"
pkill -f "bridge_agent.py"
pkill -f "conversion_agent.py"

Clear Python bytecode caches:
find agents/ -type d -name __pycache__ -exec rm -rf {} +
