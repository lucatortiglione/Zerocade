import unittest
from local_llm_preflight import select_latest


class LatestQwenTests(unittest.TestCase):
    def test_release_version_precedes_size_or_upload_order(self):
        models=[{'id':'Qwen/Qwen3-32B'},{'id':'Qwen/Qwen3.8-27B'},
                {'id':'Qwen/Qwen3.8-27B-FP8'},{'id':'other/Qwen4-30B'},
                {'id':'Qwen/Qwen3.8-Coder-30B'},{'id':'Qwen/Qwen3.8-2.4T-A95B'}]
        self.assertEqual(select_latest(models),'Qwen/Qwen3.8-27B')

    def test_new_release_never_falls_back_to_an_older_larger_model(self):
        self.assertEqual(select_latest([{'id':'Qwen/Qwen3.8-27B'},{'id':'Qwen/Qwen4-14B'}]),'Qwen/Qwen4-14B')

    def test_models_outside_the_local_dense_budget_are_excluded(self):
        self.assertEqual(select_latest([{'id':'Qwen/Qwen4-72B'},{'id':'Qwen/Qwen4-30B'}]),'Qwen/Qwen4-30B')


if __name__=='__main__':unittest.main()
