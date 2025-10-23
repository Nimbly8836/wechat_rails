module SolidQueueSupervisorPatch
  private

    def supervise
      loop do
        break if stopped?

        set_procline
        process_signal_queue

        next if stopped?

        recover_supervisor
        reap_and_replace_terminated_forks
        interruptible_sleep(1.second)
      end
    ensure
      shutdown
    end

    def handle_claimed_jobs_by(terminated_fork, status)
      return unless (registered_process = process&.supervisees&.find_by(name: terminated_fork.name))

      error = SolidQueue::Processes::ProcessExitError.new(status)
      registered_process.fail_all_claimed_executions_with(error)
    end

    def recover_supervisor
      return if process.present?

      @pid = nil
      register
    end
end

ActiveSupport.on_load(:solid_queue) do
  # We're opting for a different schema approack so we need schema prefixing instead of table prefixing
  SolidQueue.singleton_class.define_method(:table_name_prefix) { 'solid_queue.' }
  SolidQueue::Supervisor.prepend SolidQueueSupervisorPatch
end
