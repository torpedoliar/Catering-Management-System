#!/bin/bash
echo "Forcing removal of catering containers..."
CONTAINERS=$(docker ps -aq --filter "name=catering")
if [ -n "$CONTAINERS" ]; then
    docker rm -f $CONTAINERS
    echo "Successfully removed catering containers."
else
    echo "No catering containers found."
fi
