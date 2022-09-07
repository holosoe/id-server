# This script runs in the secure enclave. It services 
# requests from the parent instance for proof generation.

# Forked from:
# https://github.com/aws/aws-nitro-enclaves-samples/blob/main/vsock_sample/py/vsock-sample.py

import argparse
import socket
import sys
import os
import subprocess
import pathlib
from dotenv import load_dotenv

load_dotenv()

CURRENT_DIR = pathlib.Path().resolve()
NODE_EXECUTABLE = os.getenv('NODE_EXECUTABLE')
GEN_PROOFS_NODE_SCRIPT = os.getenv('GEN_PROOFS_NODE_SCRIPT', f'{CURRENT_DIR}/generateProofs.js')

PORT = 5005
BUFF_SIZE = 1024

class VsockListener:
    """Server"""
    def __init__(self, conn_backlog=128):
        self.conn_backlog = conn_backlog
        self.latest_message = bytearray()

    def bind(self, port):
        """Bind and listen for connections on the specified port"""
        self.sock = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
        self.sock.bind((socket.VMADDR_CID_ANY, port))
        self.sock.listen(self.conn_backlog)

    def recv_data(self):
        """Receive data from a remote endpoint"""
        while True:
            (from_client, (remote_cid, remote_port)) = self.sock.accept()
            # Read BUFF_SIZE bytes at a time
            while True:
                try:
                    data = from_client.recv(BUFF_SIZE)
                except socket.error:
                    break
                if not data:
                    break
                if 'start_message' in data.decode():
                    self.latest_message = bytearray()
                elif 'end_message' in data.decode():
                    args = self.latest_message.decode().replace('\x00', '')
                    proof_type, encrypted_args = args.split(' ')
                    cmd = [NODE_EXECUTABLE, GEN_PROOFS_NODE_SCRIPT, proof_type, encrypted_args]
                    out = subprocess.run(cmd, capture_output=True)
                    # TODO: Generate proofs. Do this in node script?
                    # TODO: Encrypt and return. Do this in node script?
                    self.send_response(from_client, out.stdout.decode())
                    break
                else:
                    self.latest_message.extend(data)
            from_client.close()

    def send_response(self, from_client, message):
        total_msg_bytes = len(message) + (BUFF_SIZE - (len(message) % BUFF_SIZE))
        from_client.sendall('start_message'.encode().ljust(BUFF_SIZE, b'\0'))
        from_client.sendall(message.encode().ljust(total_msg_bytes, b'\0'))
        from_client.sendall('end_message'.encode().ljust(BUFF_SIZE, b'\0'))

    # def send_data(self, data):
    #     """Send data to a remote endpoint"""
    #     while True:
    #         (to_client, (remote_cid, remote_port)) = self.sock.accept()
    #         to_client.sendall(data)
    #         to_client.close()


def server_handler(args):
    print(f'VSOCK server listening on port {PORT}')
    server = VsockListener()
    server.bind(PORT)
    server.recv_data()


def main():
    parser = argparse.ArgumentParser(prog='vsock-sample')
    subparsers = parser.add_subparsers(title="options")

    server_parser = subparsers.add_parser("serve", description="Server",
                                          help="Listen on a given port.")
    server_parser.set_defaults(func=server_handler)

    if len(sys.argv) < 2:
        parser.print_usage()
        sys.exit(1)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()