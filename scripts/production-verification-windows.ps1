param(
  [Parameter(Mandatory = $true)]
  [string]$Payload
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class ProductionVerificationJob
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint STARTF_USESTDHANDLES = 0x00000100;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;
    private const int JobObjectBasicProcessIdList = 3;
    private const uint WAIT_OBJECT_0 = 0;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessW(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength,
        out uint returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int standardHandle);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static void ThrowLastError()
    {
        throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    private static int[] GetJobProcessIds(IntPtr job)
    {
        const int capacity = 4096;
        int headerSize = sizeof(uint) * 2;
        int bufferSize = headerSize + (IntPtr.Size * capacity);
        IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
        try
        {
            uint returned;
            if (!QueryInformationJobObject(
                job,
                JobObjectBasicProcessIdList,
                buffer,
                (uint)bufferSize,
                out returned)) ThrowLastError();
            int count = Marshal.ReadInt32(buffer, sizeof(uint));
            int[] processIds = new int[count];
            for (int index = 0; index < count; index++)
            {
                processIds[index] = (int)Marshal.ReadIntPtr(
                    buffer,
                    headerSize + (index * IntPtr.Size));
            }
            return processIds;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static void RequestGracefulShutdown(IntPtr job)
    {
        foreach (int processId in GetJobProcessIds(job))
        {
            try
            {
                Process taskkill = Process.Start(new ProcessStartInfo
                {
                    FileName = "taskkill.exe",
                    Arguments = "/pid " + processId + " /t",
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
                if (taskkill != null && !taskkill.WaitForExit(2000)) taskkill.Kill();
                if (taskkill != null) taskkill.Dispose();
            }
            catch
            {
                // The Node controller owns the five-second force-stop fallback.
            }
        }
    }

    private static void WriteExitStatus(string statusPath, uint exitCode)
    {
        string temporaryPath = statusPath + "." + Guid.NewGuid().ToString("N");
        File.WriteAllText(temporaryPath, exitCode.ToString());
        File.Move(temporaryPath, statusPath);
    }

    public static int Run(
        string applicationName,
        string commandLine,
        string currentDirectory,
        string controlPath,
        string statusPath)
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) ThrowLastError();

        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        bool processCreated = false;
        bool assigned = false;
        Stream ownerStream = Console.OpenStandardInput();
        ManualResetEvent ownerDisconnected = new ManualResetEvent(false);
        Thread ownerWatcher = new Thread(() =>
        {
            try
            {
                while (ownerStream.ReadByte() != -1) { }
            }
            catch
            {
                // A broken or closed pipe is the owner-disconnected signal.
            }
            finally
            {
                ownerDisconnected.Set();
            }
        });
        ownerWatcher.IsBackground = true;
        ownerWatcher.Start();

        try
        {
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits =
                new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int limitsSize = Marshal.SizeOf(limits);
            IntPtr limitsPointer = Marshal.AllocHGlobal(limitsSize);
            try
            {
                Marshal.StructureToPtr(limits, limitsPointer, false);
                if (!SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    limitsPointer,
                    (uint)limitsSize)) ThrowLastError();
            }
            finally
            {
                Marshal.FreeHGlobal(limitsPointer);
            }

            STARTUPINFO startup = new STARTUPINFO();
            startup.cb = (uint)Marshal.SizeOf(startup);
            startup.dwFlags = STARTF_USESTDHANDLES;
            startup.hStdInput = GetStdHandle(-10);
            startup.hStdOutput = GetStdHandle(-11);
            startup.hStdError = GetStdHandle(-12);

            processCreated = CreateProcessW(
                applicationName,
                new StringBuilder(commandLine),
                IntPtr.Zero,
                IntPtr.Zero,
                true,
                CREATE_SUSPENDED,
                IntPtr.Zero,
                currentDirectory,
                ref startup,
                out process);
            if (!processCreated) ThrowLastError();

            assigned = AssignProcessToJobObject(job, process.hProcess);
            if (!assigned) ThrowLastError();
            if (ResumeThread(process.hThread) == 0xFFFFFFFF) ThrowLastError();

            bool targetExited = false;
            bool gracefulRequested = false;
            uint exitCode = 1;
            while (true)
            {
                if (!targetExited &&
                    WaitForSingleObject(process.hProcess, 50) == WAIT_OBJECT_0)
                {
                    if (!GetExitCodeProcess(process.hProcess, out exitCode)) ThrowLastError();
                    WriteExitStatus(statusPath, exitCode);
                    targetExited = true;
                }

                if (!gracefulRequested && File.Exists(controlPath))
                {
                    gracefulRequested = true;
                    RequestGracefulShutdown(job);
                }

                if (gracefulRequested && GetJobProcessIds(job).Length == 0)
                {
                    return unchecked((int)exitCode);
                }
                if (ownerDisconnected.WaitOne(0)) return 1;
                Thread.Sleep(25);
            }
        }
        finally
        {
            if (processCreated && !assigned)
            {
                TerminateProcess(process.hProcess, 1);
            }
            if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
            CloseHandle(job);
            ownerStream.Dispose();
            if (ownerWatcher.Join(1000))
            {
                ownerDisconnected.Dispose();
            }
        }
    }
}
'@

$decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload))
$command = $decoded | ConvertFrom-Json

function ConvertTo-WindowsArgument([string]$Value) {
  if ($Value -notmatch '[\s"]' -and $Value.Length -gt 0) {
    return $Value
  }

  $escaped = '"'
  $backslashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') {
      $backslashes += 1
    } elseif ($character -eq '"') {
      $escaped += ('\' * (($backslashes * 2) + 1)) + '"'
      $backslashes = 0
    } else {
      $escaped += ('\' * $backslashes) + $character
      $backslashes = 0
    }
  }
  $escaped += ('\' * ($backslashes * 2)) + '"'
  return $escaped
}

$arguments = @($command.command) + @($command.args)
$commandLine = ($arguments | ForEach-Object { ConvertTo-WindowsArgument ([string]$_) }) -join ' '
$exitCode = [ProductionVerificationJob]::Run(
  [string]$command.command,
  $commandLine,
  (Get-Location).Path,
  [string]$command.controlPath,
  [string]$command.statusPath
)
exit $exitCode
