import os
import sys
p = sys.argv[1]
for x in os.listdir(p):
    print(x)