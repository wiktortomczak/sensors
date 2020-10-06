#!/bin/bash

while true; do
  seq 0 255;
  seq 255 -1 0;
done | while read i; do
  sleep .005; echo $i;
done
